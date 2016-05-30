var https = require('https');

const token = process.env.TOKEN;

const uberx_id = 'a1111c8c-c720-46c3-8534-2fcdd730040d'; // UberX SF
const uberblack_id = 'd4abaae7-f4d6-4152-91cc-77523e8165a4'; // UberBlack SF
const successfully_cancelled_uber_status_code = 204;
const successfully_requested_uber_status_code = 202;
const uber_surge_pricing_status_code = 409;

const start_latitude = 37.7749; // Lat SF
const start_longitude = -122.4194; // Long SF

const single_click = 'SINGLE';
const double_click = 'DOUBLE';
const long_click = 'LONG';

function callUber(event, context) {
  
    if (event.clickType === single_click) {
        requestUber(event, context, uberx_id)
    }
    else if (event.clickType === double_click) {
        requestUber(event, context, uberblack_id)
    }
    else if (event.clickType === long_click) {
        cancelUber(event, context);
    }
    else {
        context.fail(event);
    }
}

function cancelUber(event, context) {
    var headers = {
        'Authorization':  'Bearer ' + token,
        'Content-Type':   'application/json'
    };

    var options = {
        'host':    'api.uber.com',
        'path': '/v1/requests/current',
        'method':  'DELETE',
        'headers': headers
    };
    
    var req = https.request(options, function(res) {
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        
        res.on('end', function () {
            // Successfully cancelled Uber
            if (res.statusCode === successfully_cancelled_uber_status_code) {
                console.log('Uber cancelled. Status code: ' + res.statusCode);
            }
            context.done();
        });
    });
    req.end();
}

function requestUber(event, context, product_id, surge_confirmation_id) {
    var data =  {
        'product_id': product_id,
        'start_latitude':  start_latitude,
        'start_longitude': start_longitude
    };
    
    if (surge_confirmation_id) {
        data.surge_confirmation_id = surge_confirmation_id;
    }
    
    data = JSON.stringify(data);

    var headers = {
        'Authorization':  'Bearer ' + token,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data)
    };

    var options = {
        'host':    'api.uber.com',
        'path':    '/v1/requests',
        'method':  'POST',
        'headers': headers
    };
    
    var req = https.request(options, function(res) {
      
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
    
        res.on('end', function () {
            var parsed = JSON.parse(body);
          
            // Successfully requested Uber
            if (res.statusCode === successfully_requested_uber_status_code) {
                console.log('Uber requested. Status code: ' + res.statusCode);
                context.done();
            }
            // Uber has surge pricing
            else if (res.statusCode === uber_surge_pricing_status_code && !surge_confirmation_id) {
                // Send an email to confirm surge pricing
                console.log('Surge pricing. Status code: ' + res.statusCode);
                
                var options = {
                    'host':    'api.uber.com',
                    'path':    '/v1/surge-confirmations/' + parsed.meta.surge_confirmation.surge_confirmation_id
                };
                
                https.get(options, function (resp) {
                    var body = '';
                
                    resp.on('data', function (chunk) {
                        body += chunk;
                    });
                
                    resp.on("end", function () {
                        var csrf_token_etc = body.substring(body.lastIndexOf('<input name="csrf_token" type="hidden" value="')+46);
                        var csrf_token = csrf_token_etc.substring(0, csrf_token_etc.indexOf('">'));

                        var data = {
                            'csrf_token': csrf_token
                        };
                        
                        data = JSON.stringify(data);
                        
                        var headers = {
                            'Content-Type':   'application/json',
                            'Content-Length': Buffer.byteLength(data)
                        };
                        
                        var options = {
                            'host':    'api.uber.com',
                            'path':    '/v1/surge-confirmations/' + parsed.meta.surge_confirmation.surge_confirmation_id,
                            'method':  'POST',
                            'headers': headers
                        };
                        
                        var requ = https.request(options, function(respo) {
                            var body = '';
                
                            respo.on('data', function (chunk) {
                                body += chunk;
                            });
                            
                            respo.on('end', function () {
                                var parsed = JSON.parse(body);
                                requestUber(event, context, product_id, parsed.surge_confirmation_token);
                            });
                        });
                        requ.write(data);
                        requ.end();
                    });
                });
            }
            else {
                console.log('Uber request failed. Status code: ' + res.statusCode);
                context.fail(event);
            }
        });
    });

    req.write(data);
    req.end();
}

exports.handler = callUber;
