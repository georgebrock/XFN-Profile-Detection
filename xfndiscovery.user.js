// ==UserScript==
// @name          XFN Profile Discovery
// @namespace     http://georgebrock.com/
// @description   Discover a user's other profiles using the magic of XFN
// @include       *
// @require       http://code.jquery.com/jquery-latest.js
// @resource      stylesheet xfndiscovery.css
// ==/UserScript==

var XFNDiscovery = {

	profiles: [],

	init: function()
	{
		$("[rel*=me][href^=http]").each(function()
		{
			XFNDiscovery.profiles.push($(this).attr("href"));
		});

		XFNDiscovery.UI.init();
	},

	discoverMoreProfiles: function()
	{
		XFNDiscovery.UI.startedDiscoveringMoreProfiles();

		XFNDiscovery.uncrawledProfiles = [];
		XFNDiscovery.crawledProfiles = [];

		for(var i = 0, u; u = XFNDiscovery.profiles[i]; i++)
			XFNDiscovery.uncrawledProfiles.push(u);

		XFNDiscovery.crawlNextProfile();
	},

	crawlNextProfile: function()
	{
		if(XFNDiscovery.uncrawledProfiles.length == 0)
		{
			XFNDiscovery.UI.finishedDiscoveringMoreProfiles();
			return;
		}

		var url = XFNDiscovery.uncrawledProfiles.pop();
		XFNDiscovery.crawledProfiles.push(url);

		var query = "select href from html where url='"+url+"' and xpath='//a[@rel]' and (rel='me' or rel like 'me %' or rel like '% me' or rel like '% me %')"
		XFNDiscovery.queryYQL(query, function(data)
		{
			if(typeof data.error == "undefined" && typeof data.query.results == "object" && data.query.results != null)
			{
				var links = data.query.results.a;
				for(var i = 0, link; link = links[i]; i++)
				{
					if(
						link.href.match(/^http:\/\//) &&
						$.inArray(link.href, XFNDiscovery.crawledProfiles) == -1 &&
						$.inArray(link.href, XFNDiscovery.uncrawledProfiles) == -1
					)
					{
						XFNDiscovery.uncrawledProfiles.push(link.href);
						XFNDiscovery.UI.discoveredProfile(link.href);
					}
				}
			}

			XFNDiscovery.crawlNextProfile();
		});
	},

	queryYQL: function(query, callback)
	{
		var callbackName = "xfndiscovery" + new Date().getTime();
		unsafeWindow[callbackName] = callback;
		$.get("http://query.yahooapis.com/v1/public/yql?q="+escape(query)+"&format=json&callback="+escape(callbackName), {}, function(){}, "jsonp");
	}

};

XFNDiscovery.UI = {

	init: function()
	{
		if(XFNDiscovery.profiles.length == 0)
			return;

		$("head").append(
			$("<link/>")
				.attr("rel", "stylesheet")
				.attr("type", "text/css")
				.attr("href", GM_getResourceURL("stylesheet"))
		);

		XFNDiscovery.UI.$container = $("<div/>")
			.attr("id", "xfn-discovery")
			.append(
				$("<div/>")
					.addClass("content")
					.hide()
				)
			.append(
				$("<a/>")
					.addClass("trigger")
					.append("More user profiles")
					.click(XFNDiscovery.UI.trigger)
				);

		$("body").append(XFNDiscovery.UI.$container);
	},

	trigger: function()
	{
		var $content = XFNDiscovery.UI.$container.children("div.content");
		
		if($content.html() == "")
		{
			var $profileList = $("<ul/>")
				.addClass("profiles");

			var $iframe = $("<iframe/>")
				.attr("id", "xfn-discovery-frame")
				.attr("name", "xfn-discovery-frame")
				.attr("src", "data:text/html;base64,PGh0bWw+PGhlYWQ+PHRpdGxlPk5vIHByb2ZpbGUgc2VsZWN0ZWQ8L3RpdGxl\nPjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+Ym9keXtmb250LWZhbWlseTpzYW5z\nLXNlcmlmO2ZvbnQtc2l6ZTp4LWxhcmdlO308L3N0eWxlPjxib2R5PjxwPiZs\nYXJyOyBTZWxlY3QgYSBwcm9maWxlPC9wPjwvYm9keT48L2h0bWw+");
				// Base64 encoded: <html><head><title>No profile selected</title><style type="text/css">body{font-family:sans-serif;font-size:x-large;}</style><body><p>&larr; Select a profile</p></body></html>

			$content
				.append("<h4>More user profiles</h4>")
				.append($profileList)
				.append($iframe);

			for(var i = 0, p; p = XFNDiscovery.profiles[i]; i++)
				XFNDiscovery.UI.discoveredProfile(p);

			XFNDiscovery.discoverMoreProfiles();
		}
		
		$content.slideToggle();
	},

	startedDiscoveringMoreProfiles: function()
	{
		XFNDiscovery.UI.$container.find("ul.profiles")
			.before(
				$("<div/>")
					.addClass("working")
					.append("<span>Looking for more profiles&hellip;</span>")
			);
	},

	discoveredProfile: function(url)
	{
		var $pLink = $("<a/>")
			.append(url.replace(/^http:\/\//, ""))
			.attr("href", url);
		$pLink.get(0).target = "xfn-discovery-frame";

		XFNDiscovery.UI.$container.find("ul.profiles").append(
			$("<li/>")
				.append($pLink)
				.fadeIn()
		);
	},

	finishedDiscoveringMoreProfiles: function()
	{
		XFNDiscovery.UI.$container.find("div.working")
			.animate({opacity:0, height:0, paddingTop:0, paddingBottom:0}, "slow", function()
			{
				$(this).remove();
			});
	}

}

$(function()
{
	if(unsafeWindow.top != unsafeWindow)
		return;

	XFNDiscovery.init();
})