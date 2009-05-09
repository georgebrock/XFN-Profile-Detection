// ==UserScript==
// @name          XFN Profile Discovery
// @namespace     http://georgebrock.com/
// @description   Discover a user's oter profiles using the magic of XFN
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
			var $profileList = $("<ul/>");
			for(var i = 0, p; p = XFNDiscovery.profiles[i]; i++)
				$profileList.append(
					$("<li/>").append(
						$("<a/>")
							.append(p)
							.attr("href", p)
						)
					);

			$content
				.append("<h4>More user profiles</h4>")
				.append($profileList);
		}
		
		$content.slideToggle();
	}

}

$(function()
{
	XFNDiscovery.init();
})