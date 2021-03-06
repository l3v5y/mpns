// Copyright Jeff Wilcox
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// NOTES:
//
// This library is designed for Windows Phone 7.1 and 8.0 OS. To send push to 
// a 7.0 device, the developer must not include the param value (toast) or 
// any of the advanced back background tile images (tiles).

// Suggested fallback values if you're storing results in a document/db.
// See also: http://msdn.microsoft.com/en-us/library/ff941100%28v=VS.92%29.aspx
var HTTP_412_MINIMUM_DELAY_MINUTES = 61;
var ERROR_MINIMUM_DELAY_MINUTES = 5;

var url = require('url');
var http = require('http');

var Toast = function(options) {
    return new PushMessage('toast', '2', 'toast', options);
};

var LiveTile = function(options) {
    return new PushMessage('tile', '1', 'token', options);
};

var IconicTile = function(options) {
    if(!options){
        options = {};
    }
    options.tileTemplate='IconicTile';
    return new PushMessage('tile','1', 'token',options)
};

var FlipTile = function(options) {
    if(!options){
        options = {};
    }
    options.tileTemplate = 'FlipTile';
    return new PushMessage('tile', '1', 'token', options);
}

var RawNotification = function(payload, options) {
    if (options == undefined) {
        options = payload;
    } else {
        options.payload = payload;
    }
    return new PushMessage('raw', '3', undefined, options);
};

function PushMessage(pushType, quickNotificationClass, targetName, options) {
    this.pushType = pushType;
    this.notificationClass = quickNotificationClass;
    this.targetName = targetName;

    if (options) {
        copyOfInterest(options, this, propertiesOfInterest);
    }
}

PushMessage.prototype.send = function(pushUri, callback) {
    var payload = this.getXmlPayload();
    var uriInfo = url.parse(pushUri);
    var me = this;

    var headers = {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(payload).toString(),
        'Accept': 'application/*',
        'X-NotificationClass': this.notificationClass
    };

    if(this.targetName){
        headers['X-WindowsPhone-Target'] = this.targetName;
    }

    var options = {
        headers: headers,
        host: uriInfo.host,
        port: uriInfo.protocol == "http:" ? 80 : 443,
        path: uriInfo.pathname,
        method: 'POST'
    };

    var result = { };
    var err = undefined;

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        res.on('end', function() {
            result.statusCode = res.statusCode;

            // Store the important responses from MPNS.
            if (res.headers) {
                renameFieldsOfInterest(res.headers, result, {
                    'x-deviceconnectionstatus': 'deviceConnectionStatus',
                    'x-notificationstatus': 'notificationStatus',
                    'x-subscriptionstatus' : 'subscriptionStatus'
                });
            }

            // Store the fields that were sent to make it easy to log.
            copyOfInterest(me, result, propertiesOfInterest);

            switch (res.statusCode) {
                // The device is in an inactive state.
                case 412:
                    result.minutesToDelay = HTTP_412_MINIMUM_DELAY_MINUTES; // Must be at least an hour.
                    err = result;
                    break;

                // Invalid subscriptions.
                case 400:
                case 401:
                case 404:
                    result.shouldDeleteChannel = true;
                    err = result;
                    break;

                // Method Not Allowed (bug in this library)
                case 405:
                    err = result;
                    break;

                case 406:
                    err = result;
                    err.innerError = 'Per-day throttling limit reached.';
                    break;

                case 503:
                    err = result;
                    result.minutesToDelay = ERROR_MINIMUM_DELAY_MINUTES;
                    err.innerError = 'The Push Notification Service is unable to process the request.';
                    break;
            }

            if (callback)
                callback(err, err === undefined ? result : undefined);

        }).on('error', function(e) {
                result.minutesToDelay = ERROR_MINIMUM_DELAY_MINUTES; // Just a recommendation.
                err = result;
                err.innerError = e;

                if (callback)
                    callback(err);
            });
    });
    // Send the push notification to Microsoft.
    req.write(payload);
    req.end();
};

function copyOfInterest(source, destination, fieldsOfInterest) {
    if (source && destination && fieldsOfInterest && fieldsOfInterest.length) {
        for (var i = 0; i < fieldsOfInterest.length; i++) {
            var key = fieldsOfInterest[i];
            if (source[key]) {
                destination[key] = source[key];
            }
        }
    }
}

function renameFieldsOfInterest(source, destination, map) {
    if (source && destination && map) {
        for (var key in map) {
            var newKey = map[key];
            if (source[key]) {
                destination[newKey] = source[key];
            }
        }
    }
}

PushMessage.prototype.getXmlPayload = function() {
    this.validate();
    if (this.pushType == 'tile') {
        return tileToXml(this);
    } else if (this.pushType == 'toast') {
        return toastToXml(this);
    } else if (this.pushType == 'raw') {
        return this.payload;
    }
};

PushMessage.prototype.validate = function() {
    if (this.pushType != 'toast' && this.pushType != 'tile' && this.pushType != 'raw') {
        throw new Error("Only 'toast', 'tile' and 'raw' push types are currently supported.");
    }
};

function escapeXml(value) {
    if (value && value.replace) {
        value = value.replace(/\&/g,'&amp;')
                     .replace(/</g, '&lt;')
                     .replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;');
    }
    return value;
}

function getPushHeader(type, attributes) {
    return '<?xml version="1.0" encoding="utf-8"?><wp:Notification xmlns:wp="WPNotification"  Version="2.0">' + 
        startTag(type, attributes);
}

function getPushFooter(type) {
    return endTag(type) + endTag('Notification');
}

function startTag(tag, attributes, endInstead) {
    var tag = '<' + (endInstead ? '/' : '')  + 'wp:' + tag;
    if(!endInstead && attributes && attributes.length){
        attributes.forEach(function(pair){
            tag += ' ' + pair[0] + '="' + escapeXml(pair[1]) + '"';
        });
    }
    tag += '>';
    return tag;
}

function endTag(tag) {
    return startTag(tag, null, true);
}

function wrapValue(object, key, name) {
    var attributes = [];
   
    if(object[key]==' ' && object.tileTemplate=="IconicTile")
    {
            attributes.push(['Action','Clear']);
    }       
    // WP8 tiles need Action=Clear as an attribute on startTag to clear values
    return object[key] ? startTag(name,attributes) + escapeXml(object[key]) + endTag(name) : '';
}


function toastToXml(options) {
    var type = 'Toast';
    return getPushHeader(type) + 
        wrapValue(options, 'text1', 'Text1') + 
        wrapValue(options, 'text2', 'Text2') + 
        wrapValue(options, 'param', 'Param') + 
        getPushFooter(type);
}

function tileToXml(options) {
    var type = 'Tile';
    return getPushHeader(type, tileGetAttributes(options)) + 
        wrapValue(options, 'smallIconImage', 'IconImage') +
        wrapValue(options, 'iconImage', 'IconImage') +
        wrapValue(options, 'wideContent1','WideContent1') +
        wrapValue(options, 'wideContent2','WideContent2') +
        wrapValue(options, 'wideContent3','WideContent3') +
        wrapValue(options, 'backgroundImage', 'BackgroundImage') +
        wrapValue(options, 'count', 'Count') +
        wrapValue(options, 'title', 'Title') +
        wrapValue(options, 'backgroundColor', 'BackgroundColor') +
        wrapValue(options, 'backBackgroundImage', 'BackBackgroundImage') +
        wrapValue(options, 'backTitle', 'BackTitle') +
        wrapValue(options, 'backContent', 'BackContent') +
        wrapValue(options, 'smallbackgroundImage', 'SmallbackgroundImage') +
        wrapValue(options, 'wideBackgroundImage', 'WideBackgroundImage') +
        wrapValue(options, 'wideBackContent', 'WideBackContent') +
        wrapValue(options, 'wideBackBackgroundImage', 'WideBackBackgroundImage') +
        getPushFooter(type);
}

function tileGetAttributes(options){
    var attributes = [];
    if(options.tileTemplate){
        attributes.push(['Template', options.tileTemplate]);
    }
    if (options.id){
        attributes.push(['Id', options.id]);
    };;
    return attributes;
}

exports.sendTile = function () {
    send('tile', tileProperties, LiveTile, arguments);
}

exports.sendFlipTile = function() {
    send('tile', flipTileProperties, FlipTile, arguments);
}

exports.sendToast = function () {
    send('toast', toastProperties, Toast, arguments);
}

exports.sendIconicTile = function() {
    send('tile', iconicTileProperties, IconicTile, arguments);
}

exports.sendRaw = function () {
    send('raw', ['payload'], RawNotification, arguments);
}

function send(type, typeProperties, objectType, args) {
    var pushUri = Array.prototype.shift.apply(args);

    if (typeof pushUri !== 'string') 
        throw new Error('The pushUri parameter must be the push notification channel URI string.');

    var params = {}; 
    if (typeof args[0] === 'object') {
        var payload = Array.prototype.shift.apply(args);
        copyOfInterest(payload, params, typeProperties);
    }
    else {
        // assume parameters are provided as atomic, string arguments of the function call
        var i = 0;
        while ((typeof args[0] === 'string' || typeof args[0] === 'number') && i < typeProperties.length) {
            var item = Array.prototype.shift.apply(args);
            var key = typeProperties[i++];
            params[key] = item;
        }
    }

    if (type == 'toast' && typeof params.text1 !== 'string') 
        throw new Error('The text1 toast parameter must be set and a string.');

    if (type == 'tile' && Object.keys(params).length == 0) 
        throw new Error('At least 1 tile parameter must be set.');

    var callback = args[args.length - 1];

    if (callback && typeof callback !== 'function')
        throw new Error('The callback parameter, if specified, must be the callback function.');

    var instance = new objectType(params);
    instance.send(pushUri, callback);
}

var toastProperties = [
    'text1',
    'text2',
    'param'
];

var tileProperties = [
    'backgroundImage',
    'count',
    'title',
    'backBackgroundImage',
    'backTitle',
    'backContent',
    'id'
];


var flipTileProperties = tileProperties.concat([
    'smallbackgroundImage',
    'wideBackgroundImage',
    'wideBackContent',
    'wideBackBackgroundImage'
    ]);

var iconicTileProperties = [
    'smallIconImage',
    'iconImage',
    'wideContent1',
    'wideContent2',
    'wideContent3',
    'count',
    'title',
    'backgroundColor',
];


var propertiesOfInterest = toastProperties.concat(flipTileProperties).concat(iconicTileProperties);
propertiesOfInterest.push('payload', 'pushType', 'tileTemplate');

// These object constructors are effectively deprecated. Consider using 
// sendToast, sendTile or sendRaw methods going forward.
exports.liveTile = LiveTile;
exports.toast = Toast;
exports.rawNotification = RawNotification;
exports.iconicTile = IconicTile;
