require('newrelic');
var AWS = require('aws-sdk');
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

	var key = unescape(req.query.src);
	if (key == '/') {
		key = 'index.html';
	} else if (key.charAt(0) == '/') {
		key = key.substring(1);
	}
	
	var params = { Bucket: bucket, Key: key }
	
	var s3 = new AWS.S3();
	var tr = trumpet();
	tr.selectAll('script', function(elem){
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
	if (key == '/') {
		key = 'index.html';
	} else if (key.charAt(0) == '/') {
		key = key.substring(1);
	}
	
	var params = { Bucket: bucket, Key: key }
	
	var s3 = new AWS.S3();
	s3.headObject(params, function(err, data) {
		if (typeof err !== "undefined" && err !== null) {
			if (req.url.charAt(req.url.length - 1) == '/') {
				res.redirect(302, req.url + 'index.html');
			} else if (req.url.indexOf('/it/') == 0) {
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

/*
require 'simple_html_dom.php';

function fixurl($href) {
  if (strpos($href, 'http') === 0) {
    $href = str_replace('interaction-ivrea.it', 'interactionivrea.org', $href);
  } else if (strpos($href, '/') === 0) {

  } else {
    $pos = strrpos($_GET['dest'], '/');
    if ($pos !== false) {
      $href = '../' . substr($_GET['dest'], 0, $pos) .'/'. $href;
    } else {
      $href = '../' . $href;
    }
  }
  return $href;
}

$html = file_get_html('../'. $_SERVER["HTTP_HOST"] .'/'. $_GET['dest']);

if (trim($html->find('title', 0)->plaintext) == 'Object moved') {
  $html->find('head', 0)->innertext =
    "<META http-equiv=\"refresh\" content=\"0;URL=javascript:window.open('" .
    fixurl($html->find('a', 0)->href) .
    "','_top');\">" .
    $html->find('head', 0)->innertext;
}

foreach ($html->find('a') as $e) {
  $e->target='_top';
  $e->href = fixurl($e->href);
}

foreach ($html->find('link') as $e) {
  $e->href = fixurl($e->href);
}

foreach ($html->find('img') as $e) {
  $e->src = fixurl($e->src);
}

if (strpos(($html->find('title', 0)->plaintext), 'Index of') === 0) {
  $pre = str_get_html($html->find('pre', 0)->plaintext);
  foreach ($pre->find('a') as $e) {
    $e->target='_top';
    $e->href = fixurl($e->href);
  }
  $html->find('pre', 0)->innertext = $pre;
}
*/
