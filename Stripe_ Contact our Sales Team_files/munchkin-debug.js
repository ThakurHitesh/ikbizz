/*
 * $Id: munchkin-tracker-debug.js 823 2020-04-23 18:04:47Z pge $
 * $Rev: 823 $
 */
/* global window */
/* jshint -W099 */
(function (winObj) {
  'use strict';
  if (winObj.MunchkinTracker) {
    return;
  }
  var docObj = winObj.document,
    locationObj = docObj.location,
    ASSOCIATE_LEAD = 'associateLead',
    CLICK_LINK = 'clickLink',
    VISIT_WEB_PAGE = 'visitWebPage',
    munchkinEventTrackedProperty = '_mchDone',
    /* server parameters */
    serverParamId = '_mchId',
    serverParamToken = '_mchTk',
    serverParamUserWorkspace = '_mchWs',
    serverParamHostname = '_mchHo',
    serverParamPort = '_mchPo',
    serverParamRelativeUrl = '_mchRu',
    serverParamProtocol = '_mchPc',
    serverParamMunchkinVersion = '_mchVr',
    serverParamCustomName = '_mchCn',
    serverParamHref = '_mchHr',
    serverParamLref = '_mchLr',
    serverParamAnchorHash = '_mchHa',
    serverParamReferrer = '_mchRe',
    serverParamQuery = '_mchQp',
    serverParamAuthenticationKey = '_mchKy',
    serverParamExternalSource = '_mchEs',
    serverParamEcid = '_mchEcid',
    // not actually used on server side but used to defeat image caching
    serverParamNoCache = '_mchNc',
    serverParamAnonymizeIp = 'aip',
    // Aliases
    encodeURIComponentAlias = encodeURIComponent,
    // LM-124735: ITP 2.1+ Mitigation for Munchkin frontend JS
    needItpMitigation = false,
    trackingDomain = null,
    lpDomain = null,
    lpDomainSecure = false,
    PREFIX_LP_DOMAIN = '_mktoLpDomain_',
    PREFIX_SECURE_LP = '_mktoSecureLp_',
    // getLpDomainPath = '/homepage/getLpDomain',
    getLpDomainPath = '/mktoutil/lpDomain',
    getCookiePath = '/getCookie',
    // LM-121815: Cookie Sync - Munchkin Frontend
    ecidValue = null,

    //constant
    OPT_OUT_PARAMETER_NAME = 'marketo_opt_out',
    /**
     * Returns true if a variable is a function.
     */
    isFunction = function (obj) {
      return typeof obj === 'function';
    },
    eventCleanupQueue = [],
    addEvent = function (obj, type, fn, capture) {
      try {
        var safeFn = function () {
          try {
            fn.apply(this, arguments);
          } catch (e) {}
        };
        if (obj.addEventListener) {
          obj.addEventListener(type, safeFn, capture || false);
        } else if (obj.attachEvent) {
          obj.attachEvent('on' + type, safeFn);
        }
        eventCleanupQueue.push([obj, type, safeFn, capture]);
      } catch (e) {}
    },
    removeEvent = function (obj, type, fn, capture) {
      try {
        if (obj.removeEventListener) {
          obj.removeEventListener(type, fn, capture || false);
        } else if (obj.detachEvent) {
          obj.detachEvent('on' + type, fn);
        }
      } catch (e) {}
    },
    /* -------------------------------- contentloaded.js -------------------------------- */
    /*
     * 
     * Author: Diego Perini (diego.perini at gmail.com) Summary: cross-browser wrapper for DOMContentLoaded Updated: 20101020 License: MIT
     * Version: 1.2
     * 
     * URL: http://javascript.nwbox.com/ContentLoaded/ http://javascript.nwbox.com/ContentLoaded/MIT-LICENSE
     * 
     */
    // @win window reference
    // @fn function reference
    contentLoaded = function contentLoaded(fn) {
      var done = false,
        top = true,
        root = docObj.documentElement,
        init = function (e) {
          if (e.type === 'readystatechange' && docObj.readyState !== 'complete') {
            return;
          }
          if (!done) {
            done = true;
            fn.call(winObj, e.type || e);
          }
        },
        poll = null;
      poll = function () {
        try {
          root.doScroll('left');
        } catch (e) {
          winObj.setTimeout(poll, 50);
          return;
        }
        init('poll');
      };
      if (docObj.readyState === 'complete') {
        fn.call(winObj, 'lazy');
      } else {
        if (docObj.createEventObject && root.doScroll) {
          try {
            top = !winObj.frameElement;
          } catch (e) {
          }
          if (top) {
            poll();
          }
        }
        addEvent(docObj, 'DOMContentLoaded', init);
        addEvent(docObj, 'readystatechange', init);
        addEvent(winObj, 'load', init);
      }
    },
    /* -------------------------------- Utility functions -------------------------------- */
    /**
     * Returns true if a variable has a defined value.
     * 
     * @param a
     *                            [any] variable to check
     * @return [boolean] true if value is defined
     */
    isDefined = function (a) {
      return typeof a !== 'undefined' && a !== null;
    },
    trim = function (str) {
      return str.replace(/^\s+|\s+$/g, '');
    },
    hasClass = function (ele, cls) {
      return ele.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'));
    },

    supportsCrossOriginResourceSharing = (isDefined(winObj.XMLHttpRequest) && isDefined((new winObj.XMLHttpRequest()).withCredentials)),
    /**
     * Try and URL decode the URL encoded value. If the value is not malformed, the decode will work and we return the decoded value. If the
     * value is malformed, we return a string representation of the malformed value.
     * 
     * Example of a malformed value: http://test.marketo.com/malformed%20link%20url.php?text=%u2018Rocket This is malformed because the %u2018
     * is not a valid encoding. We will return http://test.marketo.com/malformed link url.php?text=%u2018Rocket from this function. We are
     * able to decode the two %20 in the main part of that URL because we try to decode the non-query parameter portion of the URL a second
     * time if the entire URL cannot be decoded on the first try.
     */
    decodeURIComponentSafe = function (val) {
      var returnVal = null, qu;
      if (isDefined(val)) {
        if (val.length === 0) {
          returnVal = '';
        } else {
          try {
            returnVal = decodeURIComponent(val);
          } catch (e) {
            // Normally the query parameters are where we find encoding problems. Try to decode
            // portion before the ? in the URL as that is more important than the query parameters
            // which we still can return but not decoded.
            qu = val.indexOf('?');
            if (qu !== -1) {
              try {
                // Try decode on just the main URL without query parameters and then
                // append the query parameters as-is to that decoded value.
                returnVal = decodeURIComponent(val.substr(0, qu)) + val.substr(qu);
              } catch (e2) {
                // Ignore this exception, will just convert whole thing to String below
              }
            }
            if (!isDefined(returnVal)) {
              returnVal = String(val);
            }
          }
        }
      }
      return returnVal;
    },
    getParamArrayFromSearchString = function (searchString, equalSeparator) {
      var returnObject = {}, eqSeparator = isDefined(equalSeparator) ? equalSeparator : '=',
        segments = searchString.split('&'), len = segments.length, index, segment, paramName, paramValue;
      for (index = 0; index < len; index = index + 1) {
        segment = segments[index].split(eqSeparator);
        if (isDefined(segment) && segment.length > 1) {
          paramName = segment.shift();
          paramValue = segment.join(eqSeparator);
          returnObject[decodeURIComponentSafe(paramName)] = decodeURIComponentSafe(paramValue);
        }
      }
      return returnObject;
    },
    /**
     * parses url parameters by using a dom object please refer to http://james.padolsey.com/javascript/parsing-urls-with-the-dom/ a complete
     * implementation in javascript is too complex and it's better to rely on the browser for this
     */
    parseUrlParams = function (url) {
      try {
        var anchorTag = docObj.createElement('a');
        anchorTag.href = url;
        return getParamArrayFromSearchString(anchorTag.search.substr(1));
      } catch (e) {
        return null;
      }
    },
    /**
     * encodes a object into flattened URL parameters
     */
    encodeUrlParams = function (flatObject, equalSeparator) {
      var prop = null, returnArray = [];
      if (isDefined(flatObject)) {
        for (prop in flatObject) {
          if (flatObject.hasOwnProperty(prop) && !isFunction(flatObject[prop]) && flatObject[prop] !== null) {
            returnArray.push(encodeURIComponentAlias(prop) + (isDefined(equalSeparator) ? equalSeparator : '=') + encodeURIComponentAlias(flatObject[prop]));
          }
        }
      }
      return returnArray.join('&');
    },
    /**
     * copies from source to destination if and only if key exists in destination already
     */
    overrideIfExists = function (destination, source) {
      var key = null;
      if (isDefined(source) && isDefined(destination)) {
        for (key in destination) {
          if (destination.hasOwnProperty(key) && isDefined(source[key])) {
            destination[key] = source[key];
          }
        }
      }
    },
    /**
     * Find the <a> or <area> link element that is the target of the click event. This starts the search at the click event's target element
     * and looks up the ancestory until finding <a> or <area>
     * 
     * @param [DOM
     *                            element] el element that is target of the event
     * @return [DOM element] the <a> or <area> element related to the target element or NULL if not found
     */
    findEventTgtLink = function (el) {
      // Assume el is the link, if not look up the hierarchy.
      var linkTgt = el, link, hrefString = locationObj.href || locationObj;
      if (hrefString.indexOf('#') > -1) {
        hrefString = hrefString.substring(0, hrefString.indexOf('#'));
      }
      while (linkTgt.tagName !== 'A' && linkTgt.tagName !== 'AREA' && isDefined(linkTgt.parentNode)) {
        linkTgt = linkTgt.parentNode;
      }
      if (linkTgt === docObj || linkTgt === winObj || (linkTgt.tagName !== 'A' && linkTgt.tagName !== 'AREA')) {
        return null;
      }
      link = trim(linkTgt.href);
      if (isDefined(link) && link.length > 0 && link.indexOf('#') !== 0 && link.indexOf(hrefString + '#') !== 0 &&
          link.indexOf('javascript') !== 0 && link.indexOf('mailto') !== 0  && !hasClass(linkTgt, 'mchNoDecorate')) {
        return linkTgt;
      }
      return null;
    },
    // If any button other than the primary (left) click or middle click then ignore this event
    // http://www.javascripter.net/faq/leftvsrightmousebutton.htm
    isTrackableButtonForEvent = function (evt) {
      var which = evt.which, button = evt.button;
      if ((isDefined(which) && (which === 1 || which === 2)) || (isDefined(button) && (button === 0 || button === 1 || button === 4))) {
        return true;
      }
      return false;
    },
    /**
     * Extract the domain name from the server host name. "www.marketo.com" would return "marketo.com" "marketo.com" would return
     * "marketo.com" "www.marketo.com.ca" would return "marketo.com.ca"
     * 
     * @param hostname
     *                            [string] server host name
     * @return [string] domain name
     */
    getDomain = function (hostname, domainLevel, domainSelectorV2) {
      var splitParts = hostname.split('.'), partsLength = splitParts.length, level = 2;
      if (isDefined(domainLevel)) {
        // level is overriden by user
        level = domainLevel;
      } else if (isDefined(domainSelectorV2) && domainSelectorV2) {
        // 2-level by default, check happy path for .com
        if (splitParts[partsLength - 1] !== 'com') {
          var ipv4Regex = new RegExp('^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$');
          if (partsLength === 4 && ipv4Regex.test(hostname)) {
            // IPv4 dotted address, use full hostname
            level = 4;
          } else if (splitParts[partsLength - 1].length === 2 && partsLength > 1 && splitParts[partsLength - 2] === 'co') {
            // Special case for .co.xx domain name, use 3-level
            level = 3;
          }
        }
      } else if (splitParts[partsLength - 1].length > 2) {
        // If top-level domain is 3 or more characters (ie. 'com', 'edu', 'net', 'info')
        // then we extract the final 2 segments of the hostname.
        level = 2;
      } else if (splitParts[partsLength - 1].length === 2) {
        // Else, if ends in .xx.<2 character country-code>, get last 3 segments of host name
        level = 3;
      } else {
        return hostname;
      }
      while (splitParts.length > level && splitParts.length > 2) {
        splitParts.shift();
      }
      return splitParts.join('.');
    },
    getMktFormSubmitButtons = function () {
      var returnVal = [], forms = docObj.forms, formsLen = forms.length, index, index2, fields, fieldsLength;
      for (index = 0; index < formsLen; index = index + 1) {
        if (hasClass(forms[index], 'lpeRegForm')) {
          fields = forms[index].elements;
          fieldsLength = fields.length;
          for (index2 = 0; index2 < fieldsLength; index2 = index2 + 1) {
            if (fields[index2].type === 'submit' && !hasClass(fields[index2], 'mchNoDecorate')) {
              returnVal.push(fields[index2]);
            }
          }
        }
      }
      return returnVal;
    },
    /**
     * Generate a random number between a mininum and a maximum number.
     * 
     * @param min
     *                            [integer] minimum number to generate
     * @param max
     *                            [integer] maximum number to generate
     * @return [integer] random number
     */
    rand = function (min, max) {
      if (max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      } else {
        return Math.floor(Math.random() * (min + 1));
      }
    },
    /**
     * Generate the client-side munchkin token that will be stored in the cookie. This token is used on the server side to associate munchkin
     * activity with a lead.
     * 
     * @param domain
     *                            [string] domain name
     * @return [string] token
     */
    generateToken = function (domain) {
      return '_mch-' + domain + '-' + new Date().getTime() + '-' + rand(10000, 99999);
    },
    /**
     * This is the cookieHelper constructor function.
     * 
     * This constructor looks for a cookie with the specified name for the current document. If one exists, it parses its value into a set of
     * name/value pairs and stores those values as properties of the newly created object.
     * 
     * To store new data in the cookie, simply set properties of the Cookie object. Avoid properties named "store" and "remove" since these
     * are reserved as method names.
     * 
     * To save cookie data in the web browser's local store, call store(). To remove cookie data from the browser's store, call remove().
     * 
     */
    cookieHelper = function (cname) {
      // First, get a list of all cookies that pertain to this document
      // We do this by reading the magic Document.cookie property
      // If there are no cookies, we don't have anything to do
      var allcookies = docObj.cookie, cookies, index, curCookie, cookieval, params, cookieObject = {
        id : null,
        token : null
      };
      cname = encodeURIComponentAlias(cname);
      /**
       * This function is the store() method of the Cookie object.
       * 
       * Arguments:
       * 
       * daysToLive: the lifetime of the cookie, in days. If you set this to zero, the cookie will be deleted. If you set it to null, or omit
       * this argument, the cookie will be a session cookie and will not be retained when the browser exits. This argument is used to set the
       * max-age attribute of the cookie. path: the value of the path attribute of the cookie domain: the value of the domain attribute of the
       * cookie secure: if true, the secure attribute of the cookie will be set
       */
      cookieObject.store = function (daysToLive, path, domain, secure) {
        // Now that we have the value of the cookie, put together the
        // complete cookie string, which includes the name and the various
        // attributes specified when the Cookie object was created
        var cookie = cname + '=' + encodeUrlParams(this, ':'), dt = new Date();
        if (daysToLive > 0) {
          dt.setTime(dt.getTime() + daysToLive * 24 * 60 * 60 * 1000);
          cookie += '; expires=' + dt.toGMTString();
        }else{
        	dt.setTime(dt.getTime() - 1);
        	cookie += '; expires=' + dt.toGMTString();
        }
        if (path) {
          cookie += '; path=' + path;
        }
        // If the domain does *not* have '.', then the store cookie will fail
        // on both IE and Firefox. The fix is to just not include domain at
        // all if it has no dot. The browser automatically adds the current
        // hostname as the domain field.
        if (domain && domain.indexOf('.') !== -1) {
          cookie += '; domain=' + domain;
        }
        if (secure) {
          cookie += '; secure';
        }
        // Now store the cookie by setting the magic Document.cookie property
        docObj.cookie = cookie;
      };
      if (allcookies !== '') {
        // Break the string of all cookies into individual cookie strings
        // Then loop through the cookie strings, looking for our name
        cookies = allcookies.split(';');
        for (index = 0; index < cookies.length; index = index + 1) {
          // LTrim cookie
          curCookie = trim(cookies[index]);
          // Does this cookie string begin with the name we want?
          if (curCookie.indexOf(cname + '=') === 0) {
            // The cookie value is the part after the equals sign
            cookieval = curCookie.substring(cname.length + 1);
            params = getParamArrayFromSearchString(cookieval);
            if (isDefined(params.id) && isDefined(params.token)) {
              overrideIfExists(cookieObject, params);
            } else {
              overrideIfExists(cookieObject, getParamArrayFromSearchString(cookieval, ':'));
            }
            break;
          }
        }
      }
      return cookieObject;
    },
    /* -------------------------------- Context Variables -------------------------------- */
    userOptions = {
      // Custom page name
      customName : null,
      // Custom URL for notification server set to default when munchkin init is called.
      notifyPrefix : null,
      // Workspace/partition optional setting
      wsInfo : null,
      // Alternative IDs to post activity to
      altIds : [],
      // Social sharing links pre-filled visitor token value
      visitorToken : null,
      // Number of days the munchkin cookie should last
      cookieLifeDays : 730, // 2 years
      // Delay in ms to improve clickLink delivery.
      clickTime : 350, // milliseconds
      // Cookie/track anonymous leads true/false
      cookieAnon : true,
      // mkt_tok identifying token override parameter
      mkt_tok : null,
      // domainLevel overrides how many parts to use from the domain name
      domainLevel : null,
      // domainSelectorV2 overrides whether or not to use new (better) selector algorithm to guess for domainLevel value, if domainLevel was absent.
      domainSelectorV2 : false,
      // load the social JS which can attach custom behavior to page elements
      // loadSocial : false,
      // Detect Replay Link limit, in millisecond
      replayDetectLimit : 5000,
      // track pages served using https only. Will set the cookie as secure.
      // non-secure pages will get tracked and converted as a separate lead 
      httpsOnly : false,
      // sets Munchkin to track links asynchronously only.
      asyncOnly : false,
      // Use Beacon API for all tracking events
      // If enabled, this would also supersede 'clickTime' and 'asyncOnly' option
      useBeaconAPI : false,
      // Anonymizes the IP address recorded in Marketo for new visitors
      anonymizeIP : false,
      // If set to true, no visitWebPage call should be made when Munchkin.Init() is called
      apiOnly : false,
      // An arbitrary external source identifier for integrator to distinguish web events traffic generated from munchkin
      // If set, munchkin requests would include query parameter '&_mchEs=<URL-encoded-value>'
      externalSource : null,
      // LM-121815: Cookie Sync - Munchkin Frontend
      // If present, this is the Organization ID from Adobe Experience Cloud platform, to identify visitor ECID
      // In the form of 24-char alphanumeric followed by '@AdobeOrg'
      orgId: null,
      // Value related to Experience Cloud ID (ecid) collected by Adobe Launch Munchkin Extension, to be passed in for cookie sync purpose
      // If present, this would override any information collected from cookie, with or without using orgId information
      _ecid: null,
      // LM-124735: ITP 2.1+ Mitigation for Munchkin frontend JS
      // Testing feature, such that QA can 'enable' to test ITP mitigation for ALL possible browsers/versions
      _itpMitigationForAll : false
    },
    /**
     * the primary tracking ID as specified at munchkin init
     */
    primaryMunchkinId = null,
    /**
     * reference to the munchkin Cookie for the current page.
     */
    munchkinCookie = null,
    /*
     * http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility
     */
    cookiesEnabled = (function () {
      return winObj.navigator.cookieEnabled ||
        (docObj.hasOwnProperty('cookie') && (docObj.cookie.length > 0 || (docObj.cookie = 'testcookie=test; max-age=10000').indexOf
              .call(docObj.cookie, 'testcookie=test;') > -1));
    }()),
    // munchkin is initialize and tracking for current page
    munchkinInitialized = false,
    // Deferred queue for methods that must happen after initalize complete
    deferredQueue = [],
    // timeexpiration when waiting for tracking to finish
    expireDateTime = null,
    // Version sentinel sent in IMAGE GETs to let us know which munchkin version client had.
    munchkinVersion = '159',
    // Do NOT use window or add dependency on other functions in this file. since webworker uses same code
    xhrTrack = function (trackUrl, sync, timeout) {
      var xhr = new winObj.XMLHttpRequest();
      xhr.open('GET', trackUrl, sync !== true);
      xhr.onreadystatechange = function () {
        // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest#readyState 
        // ready state 1 == connection opened.
        if (xhr.readyState >= 2) {
          xhr.abort();
        }
      };
      // Don't use timeout on async xhr
      if (sync) {
        // latest FF does not allow setting timeout on synchronous XHR events.
        try {
          xhr.timeout = timeout;
        } catch (e) {}
      }
      try {
        xhr.send();
      } catch (e) {}
    },
    imgTrack = function (trackUrl) {
      var trackImg = new winObj.Image(1, 1);
      trackImg.src = trackUrl;
    },
    /* -------------------------------- utility functions with context -------------------------------- */
    /**
     * Send the IMAGE GET to the server with parameters providing the context of the call (ie. visitWebPage, clickLink, associateLead, etc.)
     * 
     * @param prefix
     *                            [string] server host
     * @param url
     *                            [string] relative URL on host
     * @param params
     *                            [object] additional parameters to encode on GET
     * @param timeout
     *                            [integer] milliseconds to "try" and wait for image to load
     * @param cb
     *                            [function] optional function to call after the image is loaded
     */
    doTracking = function (prefix, url, params, extraParams, isInitialLoad) {
      var encodedUrl = prefix + url + '&' + encodeUrlParams(params) + '&' + encodeUrlParams(extraParams);
      if (userOptions.useBeaconAPI && window.navigator && window.navigator.sendBeacon) {
        window.navigator.sendBeacon(encodedUrl);
        return;
      }
      var now = new Date().getTime(), synchronous = !isInitialLoad && !userOptions.asyncOnly;
      // force async xhr on visitWebPage event type
      if (url.indexOf('webevents/' + VISIT_WEB_PAGE + '?') === 0) {
        synchronous = false;
      }
      if (supportsCrossOriginResourceSharing) {
        xhrTrack(encodedUrl, synchronous, userOptions.clickTime);
      } else {
        imgTrack(encodedUrl);
      }
      expireDateTime = now + userOptions.clickTime;
    },
    isReplayedClick = (function () {
      var lastClick;
      return function (evt, el) {
        var newClick = {
            x : evt.clientX,
            y : evt.clientY,
            el : el,
            time : (new Date()).getTime()
          };
        if (isDefined(lastClick) && newClick.x === lastClick.x && newClick.y === lastClick.y && newClick.el === lastClick.el &&
            newClick.time < lastClick.time + userOptions.replayDetectLimit) {
          return true;
        }
        lastClick = newClick;
        return false;
      };
    }()),
    /**
     * Update landing page hidden form field (if found) with the updated cookie value.
     * 
     * @param value
     *                            [string] value to place in hidden input field
     */
    updateLpFormFromCookie = function () {
      // Looking for hidden input field name='_mkt_trk'. Update its value.
      var fields = docObj.getElementsByName('_mkt_trk'), index = 0, value = '';
      if (isDefined(munchkinCookie)) {
        // Update landing page hidden form field (if found) with the updated cookie value.
        value = 'id:' + munchkinCookie.id + '&token:' + munchkinCookie.token;
      }
      for (index = 0; index < fields.length; index = index + 1) {
        if (fields[index].type === 'hidden') {
          fields[index].value = value;
        }
      }
    },
    beforeUnloadHandler = function () {
      var now, evtDetails;
      while (eventCleanupQueue.length > 0) {
        evtDetails = eventCleanupQueue.shift();
        removeEvent.apply(this, evtDetails);
      }
      // Delay/pause (blocks UI)
      if (isDefined(expireDateTime)) {
        do {
          now = new Date();
        } while (now.getTimeAlias() < expireDateTime);
      }
    },
    /**
     * Build url for notification of web event. Send the contents of the cookies as query parameters. Send browswer meta data.
     * 
     * @param url
     *                            [string] notification URL
     * @param params
     *                            [array] parameters to add to URL
     * @param extraParams
     *                            [array] optional additional parameters to add to URL
     * @param timeout
     *                            [integer] milliseconds to "try" and wait for image to load
     * @param cb
     *                            [function] optional function to call after the image is loaded
     */
    postToMunchkin = function (type, params, extraParams, initialLoad) {
      var item = null, altId, hostname = locationObj.hostname, protocol = locationObj.protocol, url = 'webevents/' + type;
      // If our initialize method hasn't been called yet, need to defer
      // this call until that time.
      if (!munchkinInitialized) {
        deferredQueue.push([ 'post', arguments ]);
        return;
      }
      // LM-109501: Add filtering logic to munchkin.js for major search engine's web crawlers
      if (window.navigator && isBot(window.navigator.userAgent)) {
        return;
      }
      if (isDefined(munchkinCookie)) {
        params[serverParamId] = munchkinCookie.id;
        params[serverParamToken] = munchkinCookie.token;
        if (isDefined(userOptions.mkt_tok)) {
          params.mkt_tok = userOptions.mkt_tok;
        }
        if (isDefined(userOptions.wsInfo)) {
          params[serverParamUserWorkspace] = userOptions.wsInfo;
        }
        if (type === CLICK_LINK) {
          params[serverParamCustomName] = isDefined(userOptions.customName) ? userOptions.customName : '';
        }
        params[serverParamHostname] = hostname;
        params[serverParamPort] = locationObj.port;
        if (!isDefined(params[serverParamRelativeUrl])) {
          params[serverParamRelativeUrl] = decodeURIComponentSafe(locationObj.pathname);
        }
        params[serverParamProtocol] = protocol;
        // Add version sentinel at end
        params[serverParamMunchkinVersion] = munchkinVersion;
        // Needed to ignore hidden iframe file downloads
        if (!isDefined(hostname) || hostname.length === 0 || protocol === 'file:') {
          return;
        }
        //add anonymize IP parameter
        if(userOptions.anonymizeIP){
        	params[serverParamAnonymizeIp] = 1;
        }
        // LM-118104: Munchkin JS to support externalSource Configuration Parameter
        if (isDefined(userOptions.externalSource)) {
          params[serverParamExternalSource] = userOptions.externalSource;
        }
        // LM-121815: Cookie Sync - Munchkin Frontend
        if (isDefined(ecidValue)) {
          params[serverParamEcid] = ecidValue;
        }
        // Add on ts in milliseconds to defeat browser caching of the img.
        url += '?' + serverParamNoCache + '=' + new Date().getTime();
        // Issue the image GET to the main munchkin ID.
        doTracking(userOptions.notifyPrefix, url, params, extraParams, initialLoad);
        // If alternative/additional munchkin IDs specified in initialization,
        // send GET to those IDs also.
        //
        for (item in userOptions.altIds) {
          if (userOptions.altIds.hasOwnProperty(item)) {
            altId = userOptions.altIds[item];
            // Update munchkin ID in params that get sent in the query parameters of the image GET.
            params[serverParamId] = altId;
            // Issue the image GET, update the URL host prefix pattern (munchkinID.mktoresp.com) to contain
            // the alternative munchkin ID.
            // !!!BAC to do - do I need to do something to help these additional GETs go through?
            doTracking(userOptions.notifyPrefix.replace(/\w{3}\-\w{3}\-\w{3}\.mktoresp\.com/i, altId + '.mktoresp.com'),
              url, params, extraParams, initialLoad);
          }
        }
      }
    },
    isBot = function(agent) {
      if (typeof agent === 'string' && agent) {
        if (agent.indexOf('AdsBot') >= 0 || agent.indexOf('Wget') >= 0 || agent.indexOf('msnbot') >= 0) {
          return true;
        }
        if (agent.indexOf('Mozilla') >= 0 && (agent.indexOf('slurp') >= 0 || agent.indexOf('bot') >= 0)) {
          return true;
        }
      }
      return false;
    },
    /**
     * If the target element of the click event is a link that we care about, we cancel the click, post our clickLink action, then re-raise
     * the event after a short delay. This version is for browsers that support addEventListener.
     * 
     * @param [Object]
     *                            evt click event object
     * @return [boolean] true if not doing the cancel and repost, false if canceling
     */
    recordEvent = function (event) {
      var evt = event || winObj.event, tgt = evt.target || evt.srcElement, linkTgt, params = {};
      // If this is anything other than a left or middle click or event is tracked by other means
      if (isTrackableButtonForEvent(evt) && !evt[munchkinEventTrackedProperty]) {
        evt[munchkinEventTrackedProperty] = true;
        linkTgt = findEventTgtLink(tgt);
        // Assume linkTgt is the link, after looking up the hierarchy.
        if (isDefined(linkTgt) && !isReplayedClick(event, linkTgt)) {
          params[serverParamHref] = decodeURIComponentSafe(linkTgt.href);
          postToMunchkin(CLICK_LINK, params);
        }
      }
    },
    updatePageLinksToTrack = function () {
      var index = 0;
      if (isDefined(docObj.links)) {
        for (index = 0; index < docObj.links.length; index = index + 1) {
          addEvent(docObj.links[index], 'click', recordEvent, true);
        }
      }
    },
    /**
     * Create the tracking cookie unless cookieAnon is false.
     * 
     * forceCreate create even if cookieAnon is false
     */
    createTrackingCookie = function (forceCreate) {
      // If our initialize method hasn't been called yet, need to defer
      // this call until that time.
      if (!munchkinInitialized) {
        deferredQueue.push([ 'createTrackingCookie', arguments ]);
        return;
      }
      // Don't create it if already done.
      if (munchkinCookie !== null) {
        return munchkinCookie;
      }
      var trackingDomain = getDomain(locationObj.hostname, userOptions.domainLevel, userOptions.domainSelectorV2),
        // munchkin id and lead context cookie
        cookie = cookieHelper('_mkto_trk'),
        httpsOnly = userOptions.httpsOnly !== false;
      // If the cookie already exists (id value is set in it) or it's a new cookie,
      // and we are supposed to cookie anonymous leads, then setup cookie.
      //
      if (isDefined(cookie.id) || userOptions.cookieAnon || forceCreate) {
        cookie.id = primaryMunchkinId;
        // Generate unique token if not done already.
        if (!isDefined(cookie.token)) {
          // Check if token available from options passed.
          if (isDefined(userOptions.visitorToken) && userOptions.visitorToken !== 'VISITOR_MKTTOK_REPLACE') {
            cookie.token = userOptions.visitorToken;
          } else {
            // Generate unique token if not done already.
            cookie.token = generateToken(trackingDomain);
          }
        }
        // Store first-party cookie for this domain.
        cookie.store(userOptions.cookieLifeDays, '/', trackingDomain, httpsOnly);
        if(httpsOnly) {
          // reload cookie from browser to ensure it was set
          cookie = cookieHelper('_mkto_trk');
        }
        // Update landing page hidden form field (if found) with the updated cookie value.
        if(!httpsOnly || isDefined(cookie.id)) {
          munchkinCookie = cookie;
          updateLpFormFromCookie();
          return cookie;
        }
      } else {
        return null;
      }
    },
    createCookieFunction = function () {
      createTrackingCookie(true);
    },
    attachCreateCookieOnClick = function (field) {
      var origHandler = field.onclick;
      if (isFunction(origHandler)) {
        field.onclick = function () {
          createCookieFunction.apply(field, arguments);
          return origHandler.apply(field, arguments);
        };
      } else {
        field.onclick = createCookieFunction;
      }
    },
    /**
     * Opt out/in user based on optOut value. Opt a user out meaning not 
     * to track user actions on the site. If the user is opt in the user
     * will be tracked as usual
     * 
     * @param optOut indication whether to opt out or in the user
     */
    optOutUser = function(optOut){
      // LM-116959: Munchkin Opt Out cookie domain is set incorrectly
      var trackingDomain = getDomain(locationObj.hostname, userOptions.domainLevel, userOptions.domainSelectorV2);
      var optOutCookie = cookieHelper('mkto_opt_out');
    	var httpsOnly = userOptions.httpsOnly !== false;
    	if(optOut){
    		optOutCookie.id=true;
    		//extend cookie's life for another 730 days
    		optOutCookie.store(730, '/', trackingDomain, httpsOnly);
    		var cookie = cookieHelper('_mkto_trk');
    		if(cookie.id){
    			//remove tracking cookie
    			cookie.store(0, '/', trackingDomain, httpsOnly);
    		}
    		
    	}else{
    		//remove opt_out cookie
    		optOutCookie.store(0, '/', trackingDomain, httpsOnly);
    	}
    },

    itpInitMunchkin = function() {
      // LM-124735: ITP 2.1+ Mitigation for Munchkin frontend JS
      // Need to make sure munchkin is always initialized, eventually 
      if (needItpMitigation && isDefined(lpDomain) && lpDomainSecure) {
        // Hit 'getCookie' endpoint to properly (re)establish cookie entry for _mkto_trk, if applicable
        var getCookieUrl = 'https://' + lpDomain + getCookiePath + '?_mchId=' + primaryMunchkinId + '&_mchTd=' + trackingDomain;
        window.fetch(getCookieUrl, {credentials: 'include'})
          .then(function (response) {
            if (response.ok) {
              return response.body;
            }
            throw new Error('status ${response.status}');
          })
          .catch(function (e) {
            window.console.warn('getCookie failed - ', e);
            // Clear local storage for now, in case customer recently changed LP domain CNAME
            window.localStorage.removeItem(PREFIX_LP_DOMAIN + primaryMunchkinId + '_' + trackingDomain);
            window.localStorage.removeItem(PREFIX_SECURE_LP + primaryMunchkinId);
            lpDomain = null;
          })
          .finally(initializeMunchkin);
      } else {
        initializeMunchkin();
      }
    },
    // LM-121815: Cookie Sync - Munchkin Frontend
    getEcidByOrgId = function(orgId) {
      if (isDefined(window.Visitor) && isDefined(orgId)) {
        try {
          var ecidInstance = window.Visitor.getInstance(orgId);
          if (isDefined(ecidInstance)) {
            return orgId + ':' + ecidInstance.getLocationHint() + ':' + ecidInstance.getMarketingCloudVisitorID();
          }
        } catch (e) {
        }
      }
      // Scrub cookie for all AMCV_ entries, to get ecid value
      // Expect cooke value to have embedded form like ...%7CMCMID%7C29819660513974018321795300767464723409%7C...
      // and ...%7CMCAAMLH-1570475479%7C9%7C...
      var reg = new RegExp('AMCV_([A-Za-z0-9]+%40AdobeOrg)=([^;]+)', 'g'), cookieMatch, ecidList = [];
      while ((cookieMatch = reg.exec(docObj.cookie)) !== null) {
        var matchOrgId = decodeURIComponent(cookieMatch[1]), mcmidMatch;
        if ((!isDefined(orgId) || matchOrgId === orgId) && (mcmidMatch = /MCMID%7C([^%]+)/.exec(cookieMatch[2])) !== null) {
          // It seems possible that location hint information may not always be available in cookie entry
          var locationMatch = /MCAAMLH-[^%]+%7C([0-9]+)/.exec(cookieMatch[2]);
          ecidList.push(matchOrgId + ':' + (isDefined(locationMatch) ? locationMatch[1] : '') + ':' + mcmidMatch[1]);
        }
      }
      return ecidList.join(';');
    },
    /**
     * Finish initialization including creating the tracking cookie and generating the visit web page. If cookieAnon is false and there is
     * no "mkt_tok" override lead query parameter, no cookie will be created.
     */
    initializeMunchkin = function () {
      if (munchkinInitialized) {
      // Only init ourself one time. Handles munchkin.js being included on a
      // page more than 1 time.
        return;
      }
      // Set flag that says munchkin has been initialized
      munchkinInitialized = true;
      // Create tracking cookie, only pass true to force creation if the mkt_tok
      // was passed in (happens via click link in email).
      var cookie = createTrackingCookie(isDefined(userOptions.mkt_tok)), deferredCall, fields, index, params = {}, extraParams = {};
      // Process the methods that might have been called by Munchkin API layer
      // before this initialize method got to run since that waits for dom ready.
      //
      while (deferredQueue.length > 0) {
        deferredCall = deferredQueue.shift();
        switch (deferredCall[0]) {
        case 'createTrackingCookie':
          cookie = createTrackingCookie.apply(docObj, deferredCall[1]);
          break;
        case 'post':
          postToMunchkin.apply(docObj, deferredCall[1]);
          break;
        }
      }

      // LM-121815: Cookie Sync - Munchkin Frontend
      if (isDefined(userOptions._ecid)) {
        // Adobe Launch was used to initialize both ECID service and Marketo Munchkin 
        ecidValue = userOptions._ecid;
      } else {
        // Scrape cookie entries for specific orgId, or for all orgs (if userOptions.orgId absent)
        ecidValue = getEcidByOrgId(userOptions.orgId);
      }

      // If we have a valid tracking cookie, generate a visit web page.
      if (isDefined(cookie)) {
        // LM-109620: Munchkin JS apiOnly mode
        // If set to true, no visitsWebPage call should be made when Munchkin.Init() is called.
        if (userOptions.apiOnly) {
          return;
        }
        params[serverParamCustomName] = isDefined(userOptions.customName) ? userOptions.customName : '';
        extraParams[serverParamAnchorHash] = decodeURIComponentSafe(locationObj.hash);
        extraParams[serverParamReferrer] = decodeURIComponentSafe(docObj.referrer);
        extraParams[serverParamQuery] = decodeURIComponentSafe(locationObj.search.substr(1).replace(/&/g, '__-__'));
        postToMunchkin(VISIT_WEB_PAGE, params, extraParams, true);
      } else if (!userOptions.cookieAnon) {
        // Else, we have no cookie because cookieAnon is false and no form fillout
        // or associateLead has created a cookie. We want to start tracking when
        // a form fillout occurs so add a click handler to the submit button.

        // Check to see if mktFormSupport.js is loaded.
        if (!(isDefined(winObj.Mkto) && isDefined(winObj.Mkto.formSubmit))) {
          // If the mktFormSupport.js is not loaded, we *try* and create the cookie when the
          // form's submit button is clicked. We do this by replacing the submit input button's
          // onclick handler with our own handler and calling the original handler after
          // ours is done.
          //
          // If we find a marketo form (class "lpeRegForm") and it has a submit button,
          // attach click handler. Allow this to be turned off by setting class "mchNoDecorate"
          // on the input.
          fields = getMktFormSubmitButtons();
          for (index = 0; index < fields.length; index = index + 1) {
            // Replace input onclick with our handler.
            attachCreateCookieOnClick(fields[index]);
          }
        }
      }
    },
    /* -------------------------------- Munchkin code -------------------------------- */
    //
    // External API: User accessible constants and static methods.
    //
    Munchkin = {
      // Constants for selecting a munchkinFunction
      ASSOCIATE_LEAD : ASSOCIATE_LEAD,
      CLICK_LINK : CLICK_LINK,
      VISIT_WEB_PAGE : VISIT_WEB_PAGE,
      /**
       * Initialization method that must be called by user javascript to set munchkin ID and prepare for tracking.
       * 
       * @param id
       *                            [string] munchkin account id
       * @param options
       *                            [array] optional override default settings
       */
      init : function (id, options) {
        // Cookies are required. and  Must have inited us with non-empty munchkin id.
        if (!cookiesEnabled  || !isDefined(id) || id.length === 0) {
          return;
        }
        // Figure out which client UI library is loaded.
        primaryMunchkinId = id;
        // LM-115533: Have Munchkin.init upcase Munchkin ID
        primaryMunchkinId = primaryMunchkinId.toUpperCase();
        var lpview = '', referrerParams, redirectParams, referrerParameter,
          // If have query parameters, try to get the mkt_tok
          // parameter which contains the campaign and lead info.
          //
          params = parseUrlParams(winObj.location.toString()),
          optOutValue = null;
        userOptions.notifyPrefix = locationObj.protocol + '//' + primaryMunchkinId + '.mktoresp.com/';
        if (isDefined(options)) {
          window.console.debug('Munchkin.init("%s") options:', id, options);
          overrideIfExists(userOptions, options);
        }
        if (isDefined(params)) {
          if (isDefined(params.mkt_tok)) {
            userOptions.mkt_tok = params.mkt_tok;
          }
          if (isDefined(params.lpview)) {
            lpview = params.lpview;
          }
          //extract opt_out parameter
          if(isDefined(params[OPT_OUT_PARAMETER_NAME])){
        	  optOutValue = params[OPT_OUT_PARAMETER_NAME];
          }
          
        }
        /*
         * Pick up mkt_tok from referrer of current page if it's not found in current URL large enterprise customers have redirection services
         * that re-direct links before coming to the actual page
         */
        if (!isDefined(userOptions.mkt_tok)) {
          referrerParams = parseUrlParams(docObj.referrer);
          if (isDefined(referrerParams.mkt_tok)) {
            userOptions.mkt_tok = referrerParams.mkt_tok;
          } else if (isDefined(referrerParams.enid) && isDefined(referrerParams.type)) {
            // code specific to current redirection engine may need to change when moving to message systems
            for (referrerParameter in referrerParams) {
              if (referrerParams.hasOwnProperty(referrerParameter) && referrerParameter !== 'enid' && referrerParameter !== 'type') {
                if (referrerParameter.indexOf('mkt_tok') > -1 || (referrerParams[referrerParameter]).indexOf('mkt_tok') > -1) {
                  redirectParams = parseUrlParams(referrerParameter + '=' + referrerParams[referrerParameter]);
                  if (isDefined(redirectParams.mkt_tok)) {
                    userOptions.mkt_tok = redirectParams.mkt_tok;
                  }
                }
              }
            }
          }
        }
        // Don't log activity for landing page preview
        if (lpview === 'preview' && /\/lpeditor\/preview$/.test(locationObj.pathname)) {
          return;
        }
        
        //validate opt out configuration
        if(optOutValue === null){
        	//no opt_out parameter so need to check if opt cookie exists
        	//get opt out cookie
        	var optOutCookie = cookieHelper('mkto_opt_out');
        	//if opt out cookie exist do not log activities
        	if(isDefined(optOutCookie.id)){
        		optOutUser(true);
        		return;
        	}
        }else if(optOutValue === 'true'){
        	//Do not log activity for opt out user
        	optOutUser(true);
        	return;
        }else if(optOutValue === 'false'){
        	optOutUser(false);
        }
        
        // LM-124735: ITP 2.1+ Mitigation for Munchkin frontend JS
        var userAgent = window.navigator.userAgent.toLowerCase(),
          isSafari = userAgent.indexOf('safari') > -1,
          versionMatch = / version\/([0-9]+.[0-9]+)/.exec(userAgent);
        // For now, only Safari 12.1+ has ITP2.1+ enforced; _itpMitigationForAll flag to override for QA purpose
        needItpMitigation = (isSafari && versionMatch && (parseFloat(versionMatch[1]) >= 12.1) || userOptions._itpMitigationForAll);
        // Check (from local storage) or look-up LP domain info based on primaryMunchkinId
        trackingDomain = getDomain(locationObj.hostname, userOptions.domainLevel, userOptions.domainSelectorV2);
        lpDomain = window.localStorage.getItem(PREFIX_LP_DOMAIN + primaryMunchkinId + '_' + trackingDomain);
        // One more optimization, to skip mitigation if both _mkto_trk cookie and lpDomain localStorage exist
        if (isDefined(lpDomain) && docObj.cookie.indexOf('_mkto_trk=') > -1) {
          needItpMitigation = false;
        }
        if (needItpMitigation && window.fetch) {
          lpDomainSecure = window.localStorage.getItem(PREFIX_SECURE_LP + primaryMunchkinId) === 'true';
          if (!isDefined(lpDomain)) {
            // Request getLpDomain end-point to retrieve this information, then save into storage
            var getLpDomainHost = locationObj.protocol + '//' + primaryMunchkinId + '.mktoutil.com';
            var getLpDomainUrl = getLpDomainHost + getLpDomainPath + '?_mchId=' + primaryMunchkinId + '&_mchTd=' + trackingDomain;
            window.fetch(getLpDomainUrl)
              .then(function (response) {
                if (response.ok) {
                  return response.json();
                }
                throw new Error('status ${response.status}');
              })
              .catch(function (e) {
                window.console.warn('getLpDomain failed - ', e);
              })
              .then(function (myData) {
                if (isDefined(myData) && isDefined(myData.domain)) {
                  window.localStorage.setItem(PREFIX_LP_DOMAIN + primaryMunchkinId + '_' + trackingDomain, lpDomain = myData.domain);
                  window.localStorage.setItem(PREFIX_SECURE_LP + primaryMunchkinId, lpDomainSecure = myData.isSecure);
                }
              })
              .finally(itpInitMunchkin);
          }
          else {
            itpInitMunchkin();
          }
        } else {
          initializeMunchkin();
        }
      // if (userOptions.loadSocial === true) {
      // loadAsync('http://marketo.com');
      //  }
      },
      /**
       * Function to associate the munchkin cookie with a specific lead. Primary use case is for external systems for form capture, login,
       * etc.
       * 
       * @param fn
       *                            [string] function to execute (one of ASSOCIATE_LEAD, CLICK_LINK, VISIT_WEB_PAGE)
       * @param attrs
       *                            [object] attributes for call
       * @param key
       *                            [string] authentication token for API call (needed for ASSOCIATE_LEAD)
       */
      munchkinFunction : function (fn, attrs, key) {
        var params = {}, extraParams = {}, attr = null;
        if (isDefined(key)) {
          params[serverParamAuthenticationKey] = key;
        }
        // Only supported call right now is associateLead.
        switch (fn) {
        case ASSOCIATE_LEAD:
          // Prefix each attribute with _mchAt in order to allow server to
          // differentiate these attrs from other query parameters.
          for (attr in attrs) {
            if (attrs.hasOwnProperty(attr)) {
              params['_mchAt' + attr] = attrs[attr];
            }
          }
          // Create tracking cookie (if not already created due to cookieAnon=false)
          createTrackingCookie(true);
          postToMunchkin(ASSOCIATE_LEAD, params);
          var warnMsg = 'The Munchkin Associate Lead Method is being deprecated and will be removed in a future release.';
          warnMsg += ' For more information, visit https://developers.marketo.com/?p=7696';
          window.console.warn(warnMsg);
          break;
        case CLICK_LINK:
          // href of the link
          if (isDefined(attrs.href)) {
            params[serverParamHref] = params[serverParamLref] = attrs.href;
            // LM-115348: munchkin.js sends click link events for non-href enabled anchors
            // Make sure Clink_Link event is posted if, and only if, href value exists
            postToMunchkin(CLICK_LINK, params);
          }
          break;
        case VISIT_WEB_PAGE:
          // URL of the page
          if (isDefined(attrs.url)) {
            params[serverParamRelativeUrl] = attrs.url;
          }
          // Query parameters
          if (isDefined(attrs.params)) {
            params[serverParamQuery] = attrs.params;
          }
          // Optional parameter to set the name of the web page asset
          if (isDefined(attrs.name)) {
            params[serverParamCustomName] = attrs.name;
          }
          extraParams[serverParamReferrer] = decodeURIComponentSafe(docObj.referrer);
          postToMunchkin(VISIT_WEB_PAGE, params, extraParams);
          break;
        default:
          break;
        }
      },
      /**
       * Create the tracking cookie unless cookieAnon is false.
       * 
       * @param [boolean]
       *                            forceCreate create even if cookieAnon is false
       */
      createTrackingCookie : function (forceCreate) {
        createTrackingCookie(forceCreate);
      }
    };
  // adding a alias avoids slow script warning
  Date.prototype.getTimeAlias = Date.prototype.getTime;
  addEvent(winObj, 'beforeunload', beforeUnloadHandler);
  addEvent(docObj, 'click', recordEvent, true);
  contentLoaded(function () {
    updateLpFormFromCookie();
    updatePageLinksToTrack();
  });
  // expose public variable;
  winObj.MunchkinTracker = winObj.Munchkin = Munchkin;
  //
  // External API: Backward compatibility with the 3 original, non-namespaced functions.
  //
  winObj.mktoMunchkin = Munchkin.init;
  winObj.mktoMunchkinFunction = Munchkin.munchkinFunction;
}(window));