// ==UserScript==
// @name          XFN Profile Discovery
// @namespace     http://georgebrock.com/
// @description   Discover a user's other profiles using the magic of XFN
// @include       *
// @require       http://code.jquery.com/jquery-latest.js
// @resource      stylesheet http://georgebrock.com/openhack2009/xfndiscovery.css
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
			{
				XFNDiscovery.profiles.push(XFNDiscovery.normaliseURL($(this).attr("href")));
			}
		});

		var here = XFNDiscovery.normaliseURL(window.location.href);
		if(XFNDiscovery.profiles.length > 0 && $.inArray(here, XFNDiscovery.profiles) == -1)
			XFNDiscovery.profiles.push(here);

		XFNDiscovery.UI.init();
	},

	discoverMoreProfiles: function()
	{
		XFNDiscovery.UI.startedDiscoveringMoreProfiles();

		XFNDiscovery.uncrawledProfiles = [];
		XFNDiscovery.crawledProfiles = [];

		for(var i = 0; i < XFNDiscovery.profiles.length; i++)
		{
			XFNDiscovery.uncrawledProfiles.push(XFNDiscovery.profiles[i]);
		}

		XFNDiscovery.crawlNextProfile();
	},

	normaliseURL: function(url)
	{
		url = url.replace(/\/$/, "");

		var service = XFNDiscovery.serviceForURL(url);
		if(service)
		{
			url = service.canonicalURL(url);
		}

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
		if(XFNDiscovery.uncrawledProfiles.length === 0)
		{
			XFNDiscovery.readSocialGraph();
			return;
		}

		var url = XFNDiscovery.uncrawledProfiles.pop();
		XFNDiscovery.crawledProfiles.push(url);

		XFNDiscovery.UI.updateWaitMessage("Looking for more profiles ("+(XFNDiscovery.crawledProfiles.length)+"/"+(XFNDiscovery.crawledProfiles.length+XFNDiscovery.uncrawledProfiles.length)+")");

		var query = "select href from html where url='"+url+"' and xpath='//a[contains(concat(\" \",@rel,\" \"), \" me \")]'";
		XFNDiscovery.queryYQL(query, function(data)
		{
			if(typeof data.error == "undefined" && typeof data.query.results == "object" && data.query.results !== null)
			{
				var links = data.query.results.a;
				for(var i = 0; i < links.length; i++)
				{
					XFNDiscovery.discoveredProfile(links[i].href);
				}
			}

			XFNDiscovery.crawlNextProfile();
		});
	},

	readSocialGraph: function()
	{
		var callbackName = "xfndiscovery" + new Date().getTime();
		var sgURL =
			"http://socialgraph.apis.google.com/lookup?edi=1&edo=0" +
			"&q=" + escape(XFNDiscovery.crawledProfiles.join(",")) +
			"&callback=" + escape(callbackName);

		unsafeWindow[callbackName] = function(data)
		{
			for(url in data.nodes)
			{
				XFNDiscovery.discoveredProfile(url);

				for(inURL in data.nodes[url].nodes_referenced_by)
				{
					var inTypes = data.nodes[url].nodes_referenced_by[inURL].types;
					if(
						inTypes.length == 1 &&
						inTypes[0] == "me" &&
						!/(last\.fm|radio\.aol\.)/.exec(inURL)	// Exclude last.fm URLs: the social graph API data isn't good
					)
					{
						XFNDiscovery.discoveredProfile(inURL);
					}
				}
			}

			if(XFNDiscovery.uncrawledProfiles.length === 0)
			{
				XFNDiscovery.UI.finishedDiscoveringMoreProfiles();
			}
			else
			{
				XFNDiscovery.crawlNextProfile();
			}
		};

		$.get(sgURL, {}, function(){}, "jsonp");
	},

	registerService: function(service)
	{
		XFNDiscovery.services.push(service);
	},

	serviceForURL: function(url)
	{
		for(var i = 0; i < XFNDiscovery.services.length; i++)
		{
			var s = XFNDiscovery.services[i];
			if(s.urlPattern.exec(url))
			{
				return s;
			}
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
		if(XFNDiscovery.profiles.length === 0)
		{
			return;
		}

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
		
		if($content.html() === "")
		{
			var $profileList = $("<ul/>")
				.addClass("profiles")
				.addClass("known");

			var $unknownTitle = $("<h5/>")
				.addClass("unknown")
				.append(
				$("<a/>")
					.append("Even more profiles&#8230; ")
					.append("<span class=\"count\">(0)</span>")
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

			for(var i = 0, p; i < XFNDiscovery.profiles.length; i++)
			{
				XFNDiscovery.UI.discoveredProfile(XFNDiscovery.profiles[i]);
			}

			$content.slideDown(function()
			{
				XFNDiscovery.discoverMoreProfiles();
				$("#xfn-discovery a.trigger").html("Hide");
			});
		}
		else
		{
			$content.slideToggle(function()
			{
				$("#xfn-discovery a.trigger").html($(this).css("display") == "none" ? "More user profiles" : "Hide");
			});
		}
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

	updateWaitMessage: function(message)
	{
		XFNDiscovery.UI.$container.find("div.working").html("<span>"+message+"</span>");
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
				.addClass(service.className);
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

		if(service && XFNDiscovery.UI.$container.find("ul.profiles.known a."+service.className).length > 0)
		{
			XFNDiscovery.UI.$container.find("ul.profiles.known a."+service.className+":last").parent().after(
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

		$("#xfn-discovery h5 span.count").html("(" + $("#xfn-discovery ul.profiles.unknown li").length + ")");
	},

	finishedDiscoveringMoreProfiles: function()
	{
		XFNDiscovery.UI.$container.find("div.working")
			.fadeOut("slow", function()
			{
				$(this).remove();
			});

		if($("#xfn-discovery ul.profiles.known li").length === 0)
		{
			$("#xfn-discovery ul.profiles.unknown").show();
		}
	}

};

$(function()
{
	if(unsafeWindow.top != unsafeWindow)
	{
		return;
	}

	XFNDiscovery.init();
});

XFNDiscovery.Service = function(name, urlPattern, usernamePart, canonicalGenerator, click)
{
	this.name = name;
	this.className = name.toLowerCase().replace(/[^a-z]/g, "");
	this.urlPattern = urlPattern;
	this.usernamePart = usernamePart;
	this.canonicalGenerator = canonicalGenerator;
	if(typeof click == "function")
	{
		this.click = click;
	}
};

XFNDiscovery.Service.prototype = {

	textForLink: function(url)
	{
		var parts = this.urlPattern.exec(url);
		if(!parts)
		{
			return url;
		}

		var text = this.name;
		if(this.usernamePart > 0)
		{
			text += " (" + parts[this.usernamePart] + ")";
		}

		return text;
	},

	canonicalURL: function(url)
	{
		var parts = this.urlPattern.exec(url);
		return parts ? this.canonicalGenerator(parts) : url;
	}

};

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Twitter", 
		/^http:\/\/(www\.)?twitter\.com\/([^\/]+)(\/(friends|favorites))?\/?$/, 2, 
		function(parts) { return "http://twitter.com/"+parts[2].toLowerCase(); },
		function(url)
		{
			var content = "<p>Unfortunately Twitter doesn't like to be embedded in another page.</p>" +
				"<p><a href=\""+url+"\" target=\"_blank\">Open this Twitter profile in a new window.</a></p>";

			$("#xfn-discovery iframe").hide();
			$("#xfn-discovery div.iframe-alternative")
				.find("div.inner").html(content).end()
				.show();
			return false;
		}
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Last.fm",
		/^http:\/\/(www\.)?(last\.fm|lastfm\.(com\.)?[a-z]+)\/user\/([^\/\?]+)\/?(\?setlang=[a-z]+)?$/, 4,
		function(parts) { return "http://www.last.fm/user/" + parts[4].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Delicious",
		/^http:\/\/((www\.)?delicious\.com|del\.icio\.us)\/([^\/]+)\/?$/, 3,
		function(parts) { return "http://delicious.com/" + parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"GitHub",
		/^http:\/\/(www\.)?github\.com\/([^\/]+)\/?$/, 2,
		function(parts) { return "http://github.com/" + parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Flickr",
		/^http:\/\/(www\.)?flickr\.com\/((people|photos)\/)?([^\/]+)(\/contacts)?\/?$/, 4,
		function(parts) { return "http://www.flickr.com/people/" + unescape(parts[4]); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Upcoming",
		/^http:\/\/upcoming.yahoo.com\/user\/([^\/]+)\/?$/, 0,
		function(parts) { return "http://upcoming.yahoo.com/user/" + parts[1]; }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"MyBlogLog",
		/^http:\/\/(www\.)?mybloglog\.com\/buzz\/members\/([^\/]+)(\/(contacts|pics))?\/?$/, 2,
		function(parts) { return "http://www.mybloglog.com/buzz/members/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"FriendFeed",
		/^http:\/\/(www\.)?(ff\.im|friendfeed\.com)\/([^\/]+)\/?/, 3,
		function(parts) { return "http://friendfeed.com/"+parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Get Satisfaction",
		/^http:\/\/(www\.)?(getsfn|getsatisfaction).com\/people\/([^\/]+)\/?/, 3,
		function(parts) { return "http://getsatisfaction.com/people/"+parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Facebook",
		/^http:\/\/(www\.)?facebook.com\/(people\/[^\/]+\/|profile\.php\?id=)([0-9]+)?/, 0,
		function(parts) { return "http://www.facebook.com/profile.php?id="+parts[3]; }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
		"Dopplr",
		/^http:\/\/(www\.)?dopplr.com\/traveller\/([^\/]+)\/?/, 2,
		function(parts) { return "http://www.dopplr.com/traveller/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Linked in",
	/^http:\/\/(www\.)?linkedin.com\/in\/([^\/]+)\/?/, 2,
	function(parts) { return "http://www.linkedin.com/in/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Slideshare",
	/^http:\/\/(www\.)?slideshare\.net\/([^\/]+)\/?/, 2,
	function(parts) { return "http://www.slideshare.net/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Identi.ca",
	/^http:\/\/(www\.)?identi\.ca\/([^\/]+)\/?/, 2,
	function(parts) { return "http://identi.ca/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"97 Bottles",
	/^http:\/\/((www|dev)\.)?97bottles.com\/people\/([^\/]+)\/?/, 3,
	function(parts) { return "http://97bottles.com/people/"+parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"The Ten Word Review",
	/^http:\/\/(www\.)?thetenwordreview\.com\/users\/([^\/]+)\/?/, 2,
	function(parts) { return "http://thetenwordreview.com/users/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Bright Kite",
	/^http:\/\/(www\.)?brightkite\.com\/people\/([^\/]+)\/?/, 2,
	function(parts) { return "http://brightkite.com/people/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Pownce",
	/^http:\/\/(www\.)?pownce\.com\/([^\/]+)\/?/, 2,
	function(parts) { return "http://pownce.com/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Digg",
	/^http:\/\/(www\.)?digg\.com\/users\/([^\/]+)\/?/, 2,
	function(parts) { return "http://digg.com/users/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Technorati",
	/^http:\/\/([a-z0-9]+\.)?technorati\.com\/(people\/technorati|profile)\/([^\/]+)\/?/, 3,
	function(parts) { return "http://technorati.com/profile/"+parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Vimeo",
	/^http:\/\/(www\.)?vimeo\.com\/([^\/]+)\/?/, 2,
	function(parts) { return "http://vimeo.com/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"StumbleUpon",
	/^http:\/\/([^\.]+)\.stumbleupon\.com\/?/, 1,
	function(parts) { return "http://"+parts[1].toLowerCase()+".stumbleupon.com"; }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"LoveFilm",
	/^http:\/\/(www\.)?lovefilm\.com\/profile\/([^\/]+)\/?/, 2,
	function(parts) { return "http://www.lovefilm.com/profile/"+parts[2].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"Wikipedia",
	/^http:\/\/(en)\.wikipedia\.org\/wiki\/User:([^\/]+)\/?/, 2,
	function(parts) { return "http://"+parts[1]+".wikipedia.org/wiki/User:"+parts[2]; }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"YouTube",
	/^http:\/\/(www\.)?youtube\.com\/(user\/|profile\?user=)([^\/]+)\/?/, 3,
	function(parts) { return "http://www.youtube.com/user/"+parts[3].toLowerCase(); }
	));

XFNDiscovery.registerService(new XFNDiscovery.Service(
	"XBox Live",
	/^http:\/\/live\.xbox\.com\/member\/([^\/]+)\/?$/, 1,
	function(parts) { return "http://live.xbox.com/member/" + parts[1].toLowerCase(); }
	));