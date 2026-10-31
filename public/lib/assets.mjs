// Oregon Trail AI Edition — Graphics Asset Pipeline
// Loads and tracks authentic 19th-century lithograph/woodcut engraving assets.

const READY_ASSETS = new Set();
let preloadPromise = null;

export const ASSET_MANIFEST = {
  wagon_body: {
    src: "/assets/art/convoy/wagon_body.svg",
  },
  wagon_wheel_rear: {
    src: "/assets/art/convoy/wagon_wheel_rear.svg",
  },
  wagon_wheel_front: {
    src: "/assets/art/convoy/wagon_wheel_front.svg",
  },
  ox_sheet: {
    src: "/assets/art/convoy/ox_sheet.svg",
    opts: {
      sliceX: 4,
      sliceY: 1,
      anims: {
        walk: { from: 0, to: 3, loop: true, speed: 3.5 },
        idle: 0,
      },
    },
  },
  pioneer_leader_sheet: {
    src: "/assets/art/convoy/pioneer_leader_sheet.svg",
    opts: {
      sliceX: 4,
      sliceY: 1,
      anims: {
        walk: { from: 0, to: 3, loop: true, speed: 5 },
        idle: 0,
      },
    },
  },
  pioneer_companion_sheet: {
    src: "/assets/art/convoy/pioneer_companion_sheet.svg",
    opts: {
      sliceX: 4,
      sliceY: 1,
      anims: {
        walk: { from: 0, to: 3, loop: true, speed: 5 },
        idle: 0,
      },
    },
  },
  tree_cottonwood: {
    src: "/assets/art/scenery/tree_cottonwood.svg",
  },
  tree_pine: {
    src: "/assets/art/scenery/tree_pine.svg",
  },
  wildlife_bison: {
    src: "/assets/art/wildlife/bison.svg",
  },
  wildlife_deer: {
    src: "/assets/art/wildlife/deer.svg",
  },
  wildlife_rabbit: {
    src: "/assets/art/wildlife/rabbit.svg",
  },
  landmark_chimney_rock: {
    src: "/assets/art/landmarks/chimney_rock.svg",
  },
  landmark_fort_laramie: {
    src: "/assets/art/landmarks/fort_laramie.svg",
  },
  landmark_independence_rock: {
    src: "/assets/art/landmarks/independence_rock.svg",
  },
  landmark_willamette: {
    src: "/assets/art/landmarks/willamette_arrival.svg",
  },
  river_ferry: {
    src: "/assets/art/river/river_ferry.svg",
  },
};

/**
 * Returns true if the given asset key is loaded and ready in Kaplay.
 */
export function isAssetReady(key) {
  return READY_ASSETS.has(key);
}

/**
 * Preloads all registered art assets asynchronously using Kaplay's loadSprite.
 * Wraps custom Kaplay Asset lifecycle in native Promises with error tolerance.
 */
export function preloadGameAssets(k) {
  if (preloadPromise) return preloadPromise;

  const entries = Object.entries(ASSET_MANIFEST);
  const promises = entries.map(([key, def]) => {
    return new Promise((resolve) => {
      try {
        const asset = def.opts
          ? k.loadSprite(key, def.src, def.opts)
          : k.loadSprite(key, def.src);

        if (asset && typeof asset.onLoad === "function") {
          asset.onLoad(() => {
            READY_ASSETS.add(key);
            resolve(key);
          });
          asset.onError((err) => {
            console.warn(`[Assets] Asset ${key} failed to load from ${def.src}:`, err?.message || err);
            resolve(null);
          });
        } else if (asset && typeof asset.then === "function") {
          asset
            .then(() => {
              READY_ASSETS.add(key);
              resolve(key);
            })
            .catch((err) => {
              console.warn(`[Assets] Asset ${key} promise error:`, err?.message || err);
              resolve(null);
            });
        } else {
          // Synchronous or already loaded
          READY_ASSETS.add(key);
          resolve(key);
        }
      } catch (err) {
        console.warn(`[Assets] Unexpected error loading ${key}:`, err?.message || err);
        resolve(null);
      }
    });
  });

  preloadPromise = Promise.all(promises).then((loaded) => {
    const successCount = loaded.filter(Boolean).length;
    if (typeof window !== "undefined") {
      window.__gameAssetsLoaded = true;
    }
    return { successCount, total: entries.length };
  });

  return preloadPromise;
}
