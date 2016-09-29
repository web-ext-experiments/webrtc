# Proposed webrtc webextension api

The initial version of the webrtc webextension api is a limited
set of events, just enough to implement the extension from
[this mozhacks article](https://hacks.mozilla.org/2015/09/controlling-webrtc-peerconnections-with-an-extension/).

To use any of these events, an extension must have the `"webrtc"`
permission (in addition to the `"experiments.webrtc"` permission unless/until
this api lands in central).  In addition, an extension must have the
`"webrtc.blocking"` permission to add a blocking onPeerConnection listener.

The events are:

## onPeerConnection

This event is dispatched when an initial attemp is made to establish
a peer connection (by calling any of the methods
[`createOffer()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer),
[`createAnswer()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createAnswer),
[`setLocalDescription()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setLocalDescription),
or [`setRemoteDescription()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/setRemoteDescription)
on an [`RTCPeerConnection`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection)
).
Usage is similar to other webextension events, though note that optional
extra argument to `addListener()`:

```js
function listener(origin, id) { ... }

browser.webrtc.onPeerConnection.addListener(listener, blocking);
browser.webrtc.onPeerConnection.removeListener(listener);
browser.webrtc.onPeerConnection.hasListener(listener);
```

The provided callback function (`listener` above) is passed the origin
of the page that is opening a peer connection as a string, and an
opaque identifier that can be used to identify the specific connection
request being canceled when handling the 
[`onPeerConnectionCancel`](#onPeerConnectionCancel) event.

If a truthy value is passed for the `blocking` argument,
the value returned from the listener function controls whether
connection setup is allowed to proceed or not.  If the listener returns
a string with the value `"allow"` or `"deny"`, the connection is allowed
or denied, respectively.  If any other string value or other primitive
data type is returned, the system default is applied (which typically
allows the connection).  If the listener returns a Promise, processing
of the connection is delayed until the Promise is resolved, at which point
the processing described above is applied to the Promise resolution value.

## onPeerConnectionCancel

This event is dispatched when a pending RTCPeerConnection is canceled
(which happens for example when a tab with a pending connection is closed
or navigates to another page).

```js
function listener(origin, id) { ... }

browser.webrtc.onPeerConnectionCancel.addListener(listener);
browser.webrtc.onPeerConnectionCancel.removeListener(listener);
browser.webrtc.onPeerConnectionCancel.hasListener(listener);
```

The `origin` and `id` arguments passed to the listener are
identical to those passed to a listener for
[`onPeerConnection`](#onPeerConnection).

## onMediaPermissions

This event is dispatched whenever the browser establishes permissions for
[`getUserMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
Typically this happens after a permissions prompt is displayed to the
user, but it may also happen if the user perviously granted permanent
permission to a particular page.

Extensions can use this event to avoid excessive user prompts
(i.e., by avoiding also asking for permission to establish a peer
connection if the
user has already granted access to their media devices for the origin).

```js
function listener(origin, permissions) { ... }

browser.webrtc.onMediaPermissions.addListener(listener);
browser.webrtc.onMediaPermissions.removeListener(listener);
browser.webrtc.onMediaPermissions.hasListener(listener);
```

The `origin` argument is the origin of the page that has been granted
permissions (
The `permissions` argument is an object with two properties:
`camera` and `microphone`.  These properties are boolean-valued and
indicate whether permission has been granted to access a camera or
microphone device, respectively.
