# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People on Windows, macOS, and Linux computers who want to watch publicly available live TV without configuring a separate media player. Open-source contributors are a secondary audience.

## Product Purpose

Make free public live TV and internet radio easy to find and play in a local browser window. Success means a viewer can choose country, language, and interests on first open, find a relevant channel or station, and switch with little effort.

## Positioning

A local browser player that combines a global channel guide, feed health checks, stream playback, and natural-language discovery in one open-source app.

## Operating Context

The viewer downloads and runs a small local executable. It opens a browser on localhost. An internet connection is required for the channel catalog, AI model's first download, and streams. Browsers, screens, bandwidth, region rules, and broadcaster reliability vary.

## Capabilities and Constraints

- First-run country, language, and interest choices; channel search and secondary filters; favorites stored in the browser.
- HLS playback with media-segment preflight, backup feed retry, short-term failed-channel suppression, and a similar-channel recovery action.
- Internet radio with country, city, genre, and optional on-device location matching against a bundled city index.
- On-device language model currently interprets broad channel categories, with direct matching for names, countries, and languages.
- A local server is required to fetch data and proxy HLS media. Do not imply the static `index.html` works on its own.
- Preserve open-source distribution, public GitHub source, and no VLC configuration.
- Upstream streams can fail or be restricted. Do not promise universal availability.

## Evidence on Hand

The app source, published release, current browser interface, iptv-org data, and IPTV Nexus health index. No owned video library, original channel photography, or live-program guide content is available.

## Product Principles

- Make playback and channel switching feel immediate.
- Show the truth about availability and failures.
- Keep discovery useful at a glance and workable with keyboard and pointer.
- Let visual craft support viewing rather than compete with the video.
