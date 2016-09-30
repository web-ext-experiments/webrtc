"use strict";

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://devtools/shared/event-emitter.js");
Cu.import("resource://gre/modules/ExtensionUtils.jsm");
const {SingletonEventManager} = ExtensionUtils;

XPCOMUtils.defineLazyModuleGetter(this, "webrtcUI",
                                  "resource:///modules/webrtcUI.jsm");

let origReceiveMessage = null;
let boundRecv = null;
let pcBlockers = new Set();
let hookCount = 0;
let emitter = new EventEmitter();

function receiveMessage(msg) {

  switch (msg.name) {
  case "rtcpeer:Request": {
    let origin = msg.target.contentPrincipal.origin;
    let id = msg.data.callID;
    emitter.emit("peer-request", origin, id);

    function answer(reply) {
      msg.target.messageManager.sendAsyncMessage(reply, {
        callID: msg.data.callID,
        windowID: msg.data.windowID,
      });
    }

    let blockers = Array.from(pcBlockers);
    function next() {
      if (blockers.length == 0) {
        origReceiveMessage(msg);
        return;
      }

      let blocker = blockers.shift();
      return blocker(origin, id).then(result => {
        if (result == "allow") {
          answer("rtcpeer:Allow");
        } else if (result == "deny") {
          answer("rtcpeer:Deny");
        } else {
          return next();
        }
      });
    }
    next().catch(err => {
      Cu.reportError(`error in PeerConnection blocker: ${err.message}`);
      origReceiveMessage(msg);
    });
    break;
  }

  case "rtcpeer:CancelRequest": {
    let origin = msg.target.contentPrincipal.origin;
    let id = msg.data;
    emitter.emit("cancel-peer-request", origin, id);
    origReceiveMessage(msg);
    break;
  }

  case "webrtc:UpdateBrowserIndicators": {
    // Beware, this will need to change when https://bugzil.la/1299577 lands
    let origin = msg.target.contentPrincipal.origin;
    let {camera, microphone} = msg.data;
    emitter.emit("media-permissions", origin, {camera, microphone});
  }

  default:
    origReceiveMessage(msg);
  }
}

function hook() {
  let first = (hookCount == 0);
  hookCount++;
  if (first) {
    origReceiveMessage = webrtcUI.receiveMessage;
    webrtcUI.receiveMessage = receiveMessage;
  }
}

function unhook() {
  hookCount--;
  if (hookCount == 0) {
    if (webrtcUI.receiveMessage != receiveMessage) {
      // XXX uh oh, what now
    }
    webrtcUI.receiveMessage = origReceiveMessage;
    origReceiveMessage = null;
  }
}

class API extends ExtensionAPI {
  getAPI(context) {
    return {
      webrtc: {
        onPeerConnectionRequest: new SingletonEventManager(context, "webrtc.onPeerConnectionRequest", (fire, blocking) => {
          hook();

          let handler = (origin, id) => {
            let result = context.runSafe(fire, origin, id);
            if (typeof result == "string") {
              return Promise.resolve(result);
            } else if (typeof result == "object" && typeof result.then == "function") {
              return result;
            } else {
              Cu.reportError(`blocking callback returned invalid ${result}\n`);
              return Promise.resolve("pass");
            }
          };
          let listener = (event, origin) => handler(origin);

          if (blocking) {
            pcBlockers.add(handler);
          } else {
            emitter.on("peer-request", listener);
          }

          return () => {
            if (blocking) {
              pcBlockers.delete(handler);
            } else {
              emitter.off("peer-request", listener);
            }
            unhook();
          };
        }).api(),

        onPeerConnectionRequestCancel: new SingletonEventManager(context, "webrtc.onPeerConnectionCancel", fire => {
          hook();
          let listener = (event, origin, id) => {
            context.runSafe(fire, origin, id);
          };
          emitter.on("cancel-peer-request", listener);

          return () => {
            emitter.off("cancel-peer-request", listener);
            unhook();
          };
        }).api(),

        onMediaPermissions: new SingletonEventManager(context, "webrtc.onMediaPermissions", fire => {
          hook();
          let listener = (event, origin, data) => {
            context.runSafe(fire, origin, data);
          };

          emitter.on("media-permissions", listener);
          return () => {
            emitter.off("media-permissions", listener);
            unhook();
          };
        }).api(),
      },
    };
  }
}
