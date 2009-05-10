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
				XFNDiscovery.profiles.push(XFNDiscovery.normaliseURL($(this).attr("href")));
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

	normaliseURL: function(url)
	{
		url = url.replace(/\/$/, "");

		var service = XFNDiscovery.serviceForURL(url);
		if(service)
			url = service.canonicalURL(url);

		return url;
	},

	discoveredProfile: function(url)
	{
		url = XFNDiscovery.normaliseURL(url);

		if(
			url.match(/^http:\/\//) &&
			$.inArray(url, XFNDiscovery.crawledProfiles) == -1 &&
			$.inArray(url, XFNDiscovery.uncrawledProfiles) == -1
		)
		{
			XFNDiscovery.uncrawledProfiles.push(url);
			XFNDiscovery.UI.discoveredProfile(url);
		}
	},

	crawlNextProfile: function()
	{
		if(XFNDiscovery.uncrawledProfiles.length == 0)
		{
			XFNDiscovery.readSocialGraph();
			return;
		}

		var url = XFNDiscovery.uncrawledProfiles.pop();
		XFNDiscovery.crawledProfiles.push(url);

		var query = "select href from html where url='"+url+"' and xpath='//a[contains(concat(\" \",@rel,\" \"), \" me \")]'"
		XFNDiscovery.queryYQL(query, function(data)
		{
			if(typeof data.error == "undefined" && typeof data.query.results == "object" && data.query.results != null)
			{
				var links = data.query.results.a;
				for(var i = 0, link; link = links[i]; i++)
				{
					XFNDiscovery.discoveredProfile(link.href);
				}
			}

			XFNDiscovery.crawlNextProfile();
		});
	},

	readSocialGraph: function()
	{
		var callbackName = "xfndiscovery" + new Date().getTime();
		var sgURL =
			"http://socialgraph.apis.google.com/lookup?fme=1&edi=1&edo=0" +
			"&q=" + escape(XFNDiscovery.crawledProfiles.join(",")) +
			"&callback=" + escape(callbackName);

		unsafeWindow[callbackName] = function(data)
		{
			for(url in data.nodes)
			{
				XFNDiscovery.discoveredProfile(url);

				for(inURL in data.nodes[url].nodes_referenced_by)
				{
					var inTypes = data.nodes[url].nodes_referenced_by[inURL].types
					if(
						inTypes.length == 1 &&
						inTypes[0] == "me" &&
						!/(last\.fm|radio\.aol\.)/.exec(inURL)	// Exclude last.fm URLs: the social graph API data isn't good
					)
						XFNDiscovery.discoveredProfile(inURL);
				}
			}

			if(XFNDiscovery.uncrawledProfiles.length == 0)
				XFNDiscovery.UI.finishedDiscoveringMoreProfiles();
			else
				XFNDiscovery.crawlNextProfile();
		}

		$.get(sgURL, {}, function(){}, "jsonp");
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

			var $unknownTitle = $("<h5/>")
				.addClass("unknown")
				.append(
				$("<a/>")
					.append("Even more profiles&#8230;")
					.click(function()
					{
						$("#xfn-discovery ul.profiles.unknown").slideToggle("slow");
					})
			);

			var $unknownProfileList = $("<ul/>")
				.addClass("profiles")
				.addClass("unknown")
				.hide();

			var $iframeAlternative = $("<div><div class=\"inner\">&larr; Select a profile</div></div>")
				.attr("class", "iframe-alternative")
				.show();

			var $iframe = $("<iframe/>")
				.attr("id", "xfn-discovery-frame")
				.attr("name", "xfn-discovery-frame")
				.attr("src", "about:blank")
				.hide();

			$content
				.append("<h4>More user profiles</h4>")
				.append($iframe)
				.append($iframeAlternative)
				.append($profileList)
				.append($unknownTitle)
				.append($unknownProfileList);

			for(var i = 0, p; p = XFNDiscovery.profiles[i]; i++)
			{
				XFNDiscovery.UI.discoveredProfile(p);
			}

			$content.slideDown(function()
			{
				XFNDiscovery.discoverMoreProfiles();
			});
		}
		else
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
				.html("<span></span> "+service.textForLink(url))
				.addClass(service.class);
		}

		if(service && typeof service.click == "function")
		{
			$pLink.click(function()
			{
				return service.click($(this).attr("href"));
			});
		}
		else
		{
			$pLink.click(function()
			{
				$("#xfn-discovery div.iframe-alternative").hide();
				$("#xfn-discovery iframe")
					.attr("src", "about:blank")
					.show();
				return true;
			});
		}

		$pLink.get(0).target = "xfn-discovery-frame";

		if(service && XFNDiscovery.UI.$container.find("ul.profiles.known a."+service.class).length > 0)
		{
			XFNDiscovery.UI.$container.find("ul.profiles.known a."+service.class+":last").parent().after(
				$("<li/>")
					.append($pLink)
					.fadeIn()
			);
			return;
		}

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

		if($("#xfn-discovery ul.profiles.known li").length == 0)
			$("#xfn-discovery ul.profiles.unknown").show();
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
	urlPattern: /^http:\/\/(www\.)?twitter\.com\/([^\/]+)(\/(friends|favorites))?\/?$/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Twitter (@"+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://twitter.com/"+parts[2] : url;
	},

	click: function(url)
	{
		var content = "<p>Unfortunately Twitter doesn't like to be embedded in another page.</p>" +
			"<p><a href=\""+url+"\" target=\"_blank\">Open this Twitter profile in a new window.</a></p>";

		$("#xfn-discovery iframe").hide();
		$("#xfn-discovery div.iframe-alternative")
			.find("div.inner").html(content).end()
			.show();
		return false;
	}
});

XFNDiscovery.registerService({
	name: "Last.fm",
	class: "lastfm",
	urlPattern: /^http:\/\/(www\.)?(last\.fm|lastfm\.(com\.)?[a-z]+)\/user\/([^\/\?]+)\/?(\?setlang=[a-z]+)?$/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Last.fm ("+parts[4]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.last.fm/user/" + parts[4] : url;
	}
});

XFNDiscovery.registerService({
	name: "Delicious",
	class: "delicious",
	urlPattern: /^http:\/\/((www\.)?delicious\.com|del\.icio\.us)\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		var parts = /^http:\/\/((www\.)?delicious\.com|del\.icio\.us)\/([^\/]+)\/?$/.exec(url);
		console.log(parts);
		return parts ? "Delicious ("+parts[3]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = /^http:\/\/((www\.)?delicious\.com|del\.icio\.us)\/([^\/]+)\/?$/.exec(url);
		return parts ? "http://delicious.com/" + parts[3] : url;
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
	},

	canonicalURL: function(url)
	{
		var parts = /^http:\/\/(www\.)?github\.com\/([^\/]+)\/?$/.exec(url);
		return parts ? "http://github.com/" + parts[2] : url;
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
	},

	canonicalURL: function(url)
	{
		var parts = /^http:\/\/(www\.)?flickr\.com\/(people|photos)\/([^\/]+)\/?$/.exec(url);
		return parts ? "http://www.flickr.com/people/" + unescape(parts[3]) : url;
	}
});

XFNDiscovery.registerService({
	name: "Upcoming",
	class: "upcoming",
	urlPattern: /^http:\/\/upcoming.yahoo.com\/user\/[^\/]+\/?$/,

	textForLink: function(url)
	{
		return "Upcoming";
	},

	canonicalURL: function(url)
	{
		var parts = /^http:\/\/upcoming.yahoo.com\/user\/([^\/]+)\/?$/.exec(url);
		return parts ? "http://upcoming.yahoo.com/user/" + parts[1] : url;
	}
});

XFNDiscovery.registerService({
	name: "MyBlogLog",
	class: "mybloglog",
	urlPattern: /^http:\/\/(www\.)?mybloglog\.com\/buzz\/members\/([^\/]+)(\/(contacts|pics))?\/?$/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "MyBlogLog ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.mybloglog.com/buzz/members/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "FriendFeed",
	class: "friendfeed",
	urlPattern: /^http:\/\/(www\.)?(ff\.im|friendfeed\.com)\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "FriendFeed ("+parts[3]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://friendfeed.com/"+parts[3].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Get Satisfaction",
	class: "getsatisfaction",
	urlPattern: /^http:\/\/(www\.)?(getsfn|getsatisfaction).com\/people\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Get Satisfaction ("+parts[3]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://getsatisfaction.com/people/"+parts[3].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Facebook",
	class: "facebook",
	urlPattern: /^http:\/\/(www\.)?facebook.com\/(people\/[^\/]+\/|profile\.php\?id=)([0-9]+)?/,

	textForLink: function(url)
	{
		return "Facebook";
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.facebook.com/profile.php?id="+parts[3] : url;
	}
});

XFNDiscovery.registerService({
	name: "Dopplr",
	class: "dopplr",
	urlPattern: /^http:\/\/(www\.)?dopplr.com\/traveller\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Dopplr ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.dopplr.com/traveller/"+parts[2] : url;
	}
});

XFNDiscovery.registerService({
	name: "Linked in",
	class: "linkedin",
	urlPattern: /^http:\/\/(www\.)?linkedin.com\/in\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Linked in ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.linkedin.com/in/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Slideshare",
	class: "slideshare",
	urlPattern: /^http:\/\/(www\.)?slideshare\.net\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Slideshare ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://www.slideshare.net/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Identi.ca",
	class: "identica",
	urlPattern: /^http:\/\/(www\.)?identi\.ca\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Identi.ca ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://identi.ca/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "97 Bottles",
	class: "97bottles",
	urlPattern: /^http:\/\/((www|dev)\.)?97bottles.com\/people\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "97 Bottles ("+parts[3]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://97bottles.com/people/"+parts[3].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "The Ten Word Review",
	class: "thetenwordreview",
	urlPattern: /^http:\/\/(www\.)?thetenwordreview\.com\/users\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "The Ten Word Review ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://thetenwordreview.com/users/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Bright Kite",
	class: "brightkite",
	urlPattern: /^http:\/\/(www\.)?brightkite\.com\/people\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Bright Kite ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://brightkite.com/people/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Pownce",
	class: "pownce",
	urlPattern: /^http:\/\/(www\.)?pownce\.com\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Pownce ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://pownce.com/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Digg",
	class: "digg",
	urlPattern: /^http:\/\/(www\.)?digg\.com\/users\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Digg ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://digg.com/users/"+parts[2].toLowerCase() : url;
	}
});

XFNDiscovery.registerService({
	name: "Technorati",
	class: "technorati",
	urlPattern: /^http:\/\/(www\.)?technorati\.com\/people\/technorati\/([^\/]+)\/?/,

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "Technorati ("+parts[2]+")" : url;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? "http://technorati.com/people/technorati/"+parts[2].toLowerCase() : url;
	}
});

