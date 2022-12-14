var AWS = require('aws-sdk');
var Q = require('q');
var trumpet = require('trumpet');

var express = require('express');
var app = express();

app.set('port', (process.env.PORT || 5000));
app.set('views', './views');
app.set('view engine', 'jade');

app.get('/proxy-header.html', function(req, res) {
	res.render('header');
});

var buckets = [ 'courses', 'instantsoup', 'milano', 'people', 'projects', 'projectsfinal' ];

var options = {
	accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY
};

function fixURL(req, url) {
		if (url.indexOf('http') == 0) {
		url = url.replace('interaction-ivrea.it', 'interactionivrea.org');
	} else if ((url.indexOf('/') != 0) && (url.indexOf('mailto:') < 0)) {
		var base = req.query.src;
		var pos = base.lastIndexOf('/');
		base = base.substring(0, pos + 1);
		url = base + url;
	}
	return url;
}

app.get('/proxy-body.html', function(req, res) {
	console.log('Host:', req.headers.host);
	console.log('Path:', req.query.src);
	
	var bucket = 'interactionivrea.org';
	var parts = req.headers.host.split('.');
	if (parts.length == 3) {
		if (buckets.indexOf(parts[0]) >= 0) {
			bucket = parts[0] + '.interactionivrea.org';
		}
	}
	
	var params = { Bucket: bucket, Key: req.query.src }
	
	var s3 = new AWS.S3(options);
	var tr = trumpet();
	tr.selectAll('script', function(elem){
		elem.getAttribute('src', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('src', fixURL(req, value));
			}
		});
	});
	tr.selectAll('embed', function(elem){
		elem.getAttribute('src', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('src', fixURL(req, value));
			}
		});
	});
	tr.selectAll('img', function(elem){
		elem.getAttribute('src', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('src', fixURL(req, value));
			}
		});
	});
	tr.selectAll('link', function(elem){
		elem.getAttribute('href', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('href', fixURL(req, value));
			}
		});
	});
	tr.selectAll('table', function(elem){
		elem.getAttribute('background', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('background', fixURL(req, value));
			}
		});
	});
	tr.selectAll('a', function(elem){
		elem.getAttribute('href', function(value) {
			if (typeof value !== "undefined" && value !== null) {
				elem.setAttribute('href', fixURL(req, value));
			}
		});
		elem.getAttribute('target', function(value) {
			if (typeof value == "undefined" || value == null) {
				elem.setAttribute('target', '_top');
			}
		});
	});
	res.type('html');
	s3.getObject(params).createReadStream().pipe(tr).on('data', function(chunk) {
		if (chunk.toString().toLowerCase() == '</html>') {
			res.write(chunk);
			res.end();
		}
	}).pipe(res);
});

function headObject(params) {
	console.log('Head:', params);
	var deferred = Q.defer();
	var s3 = new AWS.S3(options);
	s3.headObject(params, function(err, data) {
		if (typeof err !== "undefined" && err !== null) {
			deferred.reject(err);
		} else {
			deferred.resolve(data);
		}
	});
	return deferred.promise;
}

app.get('/*', function(req, res) {
	console.log('Host:', req.headers.host);
	console.log('Path:', req.url);
	
	var bucket = 'interactionivrea.org';
	var parts = req.headers.host.split('.');
	if (parts.length == 3) {
		if (buckets.indexOf(parts[0]) >= 0) {
			bucket = parts[0] + '.interactionivrea.org';
		}
	}

	var key = unescape(req.url);
	if (key.charAt(key.length - 1) == '/') {
		key = key + 'index.html';
	}
	if (key.charAt(0) == '/') {
		key = key.substring(1);
	}
	
	var params = { Bucket: bucket, Key: key }
	
	headObject(params).fail(function(err) {
		if (key.lastIndexOf('/index.html') != (key.length - 11))  {
			key = key + '/index.html';
			params.Key = key;
			return headObject(params).fail(function(err) {
				res.status(err.statusCode);
				res.send(err.code);
			});
		} else {
			res.status(err.statusCode);
			res.send(err.code);
		}
	}).then(function(data) {
		if ((key.toLowerCase().lastIndexOf('.html') == (key.length - 5)) ||
		    (key.toLowerCase().lastIndexOf('.asp') == (key.length - 3)) ||
		    (data.ContentType == 'text/html')) {
			if (parseInt(data.ContentLength) < 1024) {
				var s3 = new AWS.S3(options);
				s3.getObject(params).send(function(err, data) {
					var html = data.Body.toString();
					if (html.indexOf('<head><title>Object moved</title></head>') >= 0) {
						var match = html.match(/<a HREF="([^"]*)">here<\/a>/);
						if (match != null) {
							res.redirect(301, match[1]);
							return;
						}
					}
					res.type('html');
					res.render('index', { src: key });
				});
			} else {
				res.type('html');
				res.render('index', { src: key });
			}
		} else {
			res.type(data.ContentType);
			var s3 = new AWS.S3(options);
			s3.getObject(params).createReadStream().pipe(res);
		}
	});
});

app.listen(app.get('port'), function() {
  console.log("Node app is running on port:" + app.get('port'));
});
