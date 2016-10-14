"use strict";

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://gre/modules/ExtensionUtils.jsm");
const {SingletonEventManager} = ExtensionUtils;

XPCOMUtils.defineLazyModuleGetter(this, "webrtcUI",
                                  "resource:///modules/webrtcUI.jsm");

class API extends ExtensionAPI {
  getAPI(context) {
    return {
      webrtc: {
        onPeerConnectionRequest: new SingletonEventManager(context, "webrtc.onPeerConnectionRequest", (fire, blocking) => {
          let handler = (params) => {
            let result = context.runSafe(fire, params.origin, params.id);
            if (typeof result == "string") {
              return Promise.resolve(result);
            } else if (typeof result == "object" && typeof result.then == "function") {
              return result;
            } else {
              Cu.reportError(`blocking callback returned invalid ${result}\n`);
              return Promise.resolve("pass");
            }
          };
          let listener = (event, params) => handler(params);

          if (blocking) {
            webrtcUI.addPeerConnectionBlocker(handler);
          } else {
            webrtcUI.emitter.on("peer-request", listener);
          }

          return () => {
            if (blocking) {
              webrtcUI.removePeerConnectionBlocker(handler);
            } else {
              webrtcUI.emitter.off("peer-request", listener);
            }
          };
        }).api(),

        onPeerConnectionRequestCancel: new SingletonEventManager(context, "webrtc.onPeerConnectionCancel", fire => {
          let listener = (event, params) => {
            context.runSafe(fire, params.origin, parms.id);
          };
          webrtcUI.emitter.on("peer-request-cancel", listener);

          return () => {
            webrtcUI.emitter.off("peer-request-cancel", listener);
          };
        }).api(),

        onMediaPermissions: new SingletonEventManager(context, "webrtc.onMediaPermissions", fire => {
          let listener = (event, params) => {
            context.runSafe(fire, params.origin, {params.camera, params.microphone});
          };

          webrtcUI.emitter.on("media-permissions", listener);
          return () => {
            webrtcUI.emitter.off("media-permissions", listener);
          };
        }).api(),
      },
    };
  }
}
