var http = require('http');
var mpns = require('./mpns');

options = {
	wideContent1:'hello!',
	wideContent2: 'great to see you',
	wideContent3: 'aaaah',
	count: '12',
	title: 'Hello :)'
};
var iconic = mpns.iconicTile('http://db3.notify.live.net/throttledthirdparty/01.00/AAGWxkL8PC5ORLzHbc8RIPlbAgAAAAADJAAAAAQUZm52OkJCMjg1QTg1QkZDMkUxREQ', options);
iconic.send();
//mpns.sendIconicTile('http://db3.notify.live.net/throttledthirdparty/01.00/AAGWxkL8PC5ORLzHbc8RIPlbAgAAAAADJAAAAAQUZm52OkJCMjg1QTg1QkZDMkUxREQ', options);