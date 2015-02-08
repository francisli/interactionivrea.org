require('newrelic');
var AWS = require('aws-sdk');
var trumpet = require('trumpet');

var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));
app.set('views', './views');
app.set('view engine', 'jade');

app.get('/proxy/header.html', function(req, res) {
	res.render('header');
});

app.get('/proxy/body.html', function(req, res) {
	console.log('Host:', req.headers.host);
	console.log('Path:', req.query.src);

	var key = req.query.src;
	if (key == '/') {
		key = 'index.html';
	} else if (key.charAt(0) == '/') {
		key = key.substring(1);
	}
	var params = { Bucket: 'interactionivrea.org', Key: key }
	var s3 = new AWS.S3();
	var tr = trumpet();
	tr.selectAll('a', function(elem){
		elem.getAttribute('href', function(value) {
			elem.setAttribute('href', value.replace('interaction-ivrea.it', 'interactionivrea.org'));
		});
		elem.getAttribute('target', function(value) {
			if (value == null) {
				elem.setAttribute('target', '_top');
			}
		});
	});
	res.type('html');
	s3.getObject(params).createReadStream().pipe(tr).pipe(res);
});

app.get('/*', function(req, res) {
	console.log('Host:', req.headers.host);
	console.log('Path:', req.url);

	var key = req.url;
	if (key == '/') {
		key = 'index.html';
	} else if (key.charAt(0) == '/') {
		key = key.substring(1);
	}
	var params = { Bucket: 'interactionivrea.org', Key: key }
	var s3 = new AWS.S3();
	s3.headObject(params, function(err, data) {
		if (typeof err !== "undefined" && err !== null) {
			console.log(err);
			if (req.url.indexOf('/it/') == 0) {
				res.redirect(302, '/en/' + req.url.substring(4));
			} else {
				res.status(err.statusCode);
				res.send(err.code);
			}
		} else if (data.ContentType == 'text/html') {
			if (parseInt(data.ContentLength) < 1024) {
				s3.getObject(params).send(function(err, data) {
					var html = data.Body.toString();
					if (html.indexOf('<head><title>Object moved</title></head>') >= 0) {
						var match = html.match(/<a HREF="([^"]*)">here<\/a>/);
						if (match != null) {
							res.redirect(301, match[1]);
							return;
						}
					}
					res.render('index', { src: req.url });
				});
			} else {
				res.render('index', { src: req.url });
			}
		} else {
			res.type(data.ContentType);
			s3.getObject(params).createReadStream().pipe(res);
		}
	});
});

app.listen(app.get('port'), function() {
  console.log("Node app is running on port:" + app.get('port'));
});
