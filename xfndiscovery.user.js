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
	services: [],

	init: function()
	{
		$("[rel][href^=http]").each(function()
		{
			var rel = " " + $(this).attr("rel") + " ";
			if(/ me /.exec(rel))
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

	registerService: function(service)
	{
		XFNDiscovery.services.push(service);
	},

	serviceForURL: function(url)
	{
		for(var i = 0, s; s = XFNDiscovery.services[i]; i++)
		{
			if(s.urlPattern.exec(url))
				return s;
		}

		return null;
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
				.addClass("profiles")
				.addClass("known");

			var $unknownProfileList = $("<ul/>")
				.addClass("profiles")
				.addClass("unknown");

			var $iframe = $("<iframe/>")
				.attr("id", "xfn-discovery-frame")
				.attr("name", "xfn-discovery-frame")
				.attr("src", "data:text/html;base64,PGh0bWw+PGhlYWQ+PHRpdGxlPk5vIHByb2ZpbGUgc2VsZWN0ZWQ8L3RpdGxl\nPjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+Ym9keXtmb250LWZhbWlseTpzYW5z\nLXNlcmlmO2ZvbnQtc2l6ZTp4LWxhcmdlO308L3N0eWxlPjxib2R5PjxwPiZs\nYXJyOyBTZWxlY3QgYSBwcm9maWxlPC9wPjwvYm9keT48L2h0bWw+");
				// Base64 encoded: <html><head><title>No profile selected</title><style type="text/css">body{font-family:sans-serif;font-size:x-large;}</style><body><p>&larr; Select a profile</p></body></html>

			$content
				.append("<h4>More user profiles</h4>")
				.append($profileList)
				.append($unknownProfileList)
				.append($iframe);

			for(var i = 0, p; p = XFNDiscovery.profiles[i]; i++)
				XFNDiscovery.UI.discoveredProfile(p);

			XFNDiscovery.discoverMoreProfiles();
		}
		
		$content.slideToggle();
	},

	startedDiscoveringMoreProfiles: function()
	{
		XFNDiscovery.UI.$container.find("ul.profiles.known")
			.before(
				$("<div/>")
					.addClass("working")
					.append("<span>Looking for more profiles&#8230;</span>")
			);
	},

	discoveredProfile: function(url)
	{
		var service = XFNDiscovery.serviceForURL(url);

		var $pLink = $("<a/>")
			.append(url.replace(/^http:\/\//, ""))
			.attr("href", url);

		if(service)
		{
			$pLink
				.html(service.textForLink(url))
				.addClass(service.class);
		}

		$pLink.get(0).target = "xfn-discovery-frame";

		XFNDiscovery.UI.$container.find("ul.profiles."+(service ? "known" : "unknown")).append(
			$("<li/>")
				.append($pLink)
				.fadeIn()
		);
	},

	finishedDiscoveringMoreProfiles: function()
	{
		XFNDiscovery.UI.$container.find("div.working")
			.fadeOut("slow", function()
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

XFNDiscovery.registerService({
	name: "Twitter",
	class: "twitter",
	urlPattern: /^http:\/\/(www\.)?twitter\.com\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/(www\.)?twitter\.com\/([^\/]+)\/?$/.exec(url);
		return parts ? "Twitter (@"+parts[2]+")" : url;
	}
});

XFNDiscovery.registerService({
	name: "Last.fm",
	class: "lastfm",
	urlPattern: /^http:\/\/(www\.)?last\.fm\/user\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/(www\.)?last\.fm\/user\/([^\/]+)\/?$/.exec(url);
		return parts ? "Last.fm ("+parts[2]+")" : url;
	}
});

XFNDiscovery.registerService({
	name: "Delicious",
	class: "delicious",
	urlPattern: /^http:\/\/(www\.)?delicious\.com\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/(www\.)?delicious\.com\/([^\/]+)\/?$/.exec(url);
		return parts ? "Delicious ("+parts[2]+")" : url;
	}
});

XFNDiscovery.registerService({
	name: "GitHub",
	class: "github",
	urlPattern: /^http:\/\/(www\.)?github\.com\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/(www\.)?github\.com\/([^\/]+)\/?$/.exec(url);
		return parts ? "GitHub ("+parts[2]+")" : url;
	}
});

XFNDiscovery.registerService({
	name: "Flickr",
	class: "flickr",
	urlPattern: /^http:\/\/(www\.)?flickr\.com\/(people|photos)\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/(www\.)?flickr\.com\/(people|photos)\/([^\/]+)\/?$/.exec(url);
		if(parts)
		{
			var txt = "Flickr";
			if(!/^[0-9]+@N[0-9]+$/.exec(parts[3]))
				txt += " (" + parts[3] + ")"
			return txt;
		}
		return url;
	}
});

XFNDiscovery.registerService({
	name: "Upcoming",
	class: "upcoming",
	urlPattern: /^http:\/\/upcoming.yahoo.com\/user\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		return "Upcoming";
	}
});
