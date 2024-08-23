(() => {
  // src/client/scripts/game/gui/statustext.mjs
  var statustext2 = function() {
    const statusMessage = document.getElementById("statusmessage");
    const statusText = document.getElementById("statustext");
    const fadeTimer = 1e3;
    const stapleLength = 900;
    const length = 45;
    let layers = 0;
    function showStatus(text, isError, durationMultiplier = 1) {
      const duration = (stapleLength + text.length * length) * durationMultiplier;
      showStatusForDuration(text, duration, isError);
    }
    function showStatusForDuration(text, durationMillis, isError) {
      if (text == null) return console.error("Cannot show status of undefined text!!");
      layers++;
      fadeAfter(durationMillis);
      statusText.textContent = text;
      statusText.classList.remove("fade-out-1s");
      statusMessage.classList.remove("hidden");
      if (!isError) {
        statusText.classList.remove("error");
        statusText.classList.add("ok");
      } else {
        statusText.classList.remove("ok");
        statusText.classList.add("error");
        console.error(text);
      }
    }
    function fadeAfter(ms) {
      setTimeout(function() {
        if (layers === 1) {
          statusText.classList.add("fade-out-1s");
          hideAfter(fadeTimer);
        } else layers--;
      }, ms);
    }
    function hideAfter(ms) {
      setTimeout(function() {
        layers--;
        if (layers > 0) return;
        statusMessage.classList.add("hidden");
        statusText.classList.remove("fade-out-1s");
      }, ms);
    }
    function lostConnection() {
      showStatus(translations["lost_connection"]);
    }
    function pleaseWaitForTask() {
      showStatus(translations["please_wait"], false, 0.5);
    }
    function getLayerCount() {
      return layers;
    }
    return Object.freeze({
      showStatus,
      lostConnection,
      pleaseWaitForTask,
      getLayerCount,
      showStatusForDuration
    });
  }();

  // src/client/scripts/game/misc/localstorage.mjs
  var localstorage2 = function() {
    const printSavesAndDeletes = false;
    const defaultExpiryTimeMillis = 1e3 * 60 * 60 * 24;
    function saveItem(key, value, expiryMillis = defaultExpiryTimeMillis) {
      if (printSavesAndDeletes) console.log(`Saving key to local storage: ${key}`);
      const timeExpires = Date.now() + expiryMillis;
      const save = { value, expires: timeExpires };
      const stringifiedSave = JSON.stringify(save);
      localStorage.setItem(key, stringifiedSave);
    }
    function loadItem(key) {
      const stringifiedSave = localStorage.getItem(key);
      if (stringifiedSave == null) return;
      let save;
      try {
        save = JSON.parse(stringifiedSave);
      } catch (e) {
        deleteItem(key);
        return;
      }
      if (hasItemExpired(save)) {
        deleteItem(key);
        return;
      }
      return save.value;
    }
    function deleteItem(key) {
      if (printSavesAndDeletes) console.log(`Deleting local storage item with key '${key}!'`);
      localStorage.removeItem(key);
    }
    function hasItemExpired(save) {
      if (save.expires == null) {
        console.log(`Local storage item was in an old format. Deleting it! Value: ${JSON.stringify(save)}}`);
        return true;
      }
      return Date.now() >= save.expires;
    }
    function eraseExpiredItems() {
      const keys = Object.keys(localStorage);
      if (keys.length > 0) console.log(`Items in local storage: ${JSON.stringify(keys)}`);
      for (const key of keys) {
        loadItem(key);
      }
    }
    function eraseAll() {
      console.log("Erasing ALL items in local storage...");
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        deleteItem(key);
      }
    }
    return Object.freeze({
      saveItem,
      loadItem,
      deleteItem,
      eraseExpiredItems,
      eraseAll
    });
  }();

  // src/client/scripts/game/misc/sound.mjs
  var sound = function() {
    const soundStamps = {
      gamestart: [0, 2],
      move: [2, 2.21],
      capture: [2.21, 2.58],
      bell: [2.58, 5.57],
      lowtime: [5.57, 6.3],
      win: [6.3, 8.3],
      draw: [8.3, 10.31],
      loss: [10.31, 12.32],
      drum1: [12.32, 16.32],
      drum2: [16.32, 19.57],
      tick: [19.57, 25.32],
      ticking: [25.32, 36.82],
      viola_staccato_c3: [36.82, 38.82],
      violin_staccato_c4: [38.82, 40.82],
      marimba_c2: [40.82, 42.82],
      marimba_c2_soft: [42.82, 44.82],
      base_staccato_c2: [44.82, 46.82]
      // draw_offer: [46.89, 48.526]   Only present for the sound spritesheet in dev-utils that includes the draw offer sound
    };
    let audioContext;
    let audioDecodedBuffer;
    const bellDist = 1e6;
    const minReverbDist = 15;
    const maxReverbDist = 80;
    const maxReverbVol = 3.5;
    const reverbDuration = 1.5;
    const amountToDampenSkippedMoves = 0.5;
    const amountToDampenSkippedBell = 0.3;
    let timeLastMoveSoundPlayed = 0;
    const millisBetwMoveSounds = 35;
    function getAudioContext() {
      return audioContext;
    }
    function initAudioContext(audioCtx, decodedBuffer) {
      audioContext = audioCtx;
      audioDecodedBuffer = decodedBuffer;
    }
    function playSound(soundName, { volume = 1, delay = 0, offset = 0, fadeInDuration, reverbVolume, reverbDuration: reverbDuration2 } = {}) {
      if (!htmlscript.hasUserGesturedAtleastOnce()) return;
      if (!audioContext) throw new Error(`Can't play sound ${soundName} when audioContext isn't initialized yet! (Still loading)`);
      const soundStamp = getSoundStamp(soundName);
      const offsetSecs = offset / 1e3;
      const startTime = soundStamp[0] + offsetSecs;
      const duration = getStampDuration(soundStamp) - offsetSecs;
      if (duration < 0) return;
      const currentTime = audioContext.currentTime;
      const startAt = currentTime + delay;
      const soundObject = {
        /** The source of the audio, with its attached `gainNode`. @type {AudioBufferSourceNode} */
        source: void 0,
        /** The source of the reverb-only part of the audio, if specified, with its attached `gainNode`. @type {AudioBufferSourceNode} */
        sourceReverb: void 0,
        /**
         * Stops the sound from playing. Could create static pops, if that happens use fadeOut() instead.
         * @param {number} durationMillis - The duration of the fade out
         */
        stop: () => {
          soundObject.source.stop();
          if (soundObject.sourceReverb) soundObject.sourceReverb.stop();
        },
        /**
         * Fades out the sound.
         * @param {number} durationMillis - The duration of the fade out
         */
        fadeOut: (durationMillis) => {
          fadeOut(soundObject.source, durationMillis);
          if (soundObject.sourceReverb) fadeOut(soundObject.sourceReverb, durationMillis);
        }
      };
      const source = createBufferSource(volume);
      source.start(startAt, startTime, duration);
      soundObject.source = source;
      if (!reverbVolume) return fadeInAndReturn();
      if (reverbDuration2 == null) return console.error("Need to specify a reverb duration.");
      const sourceReverb = createBufferSource(reverbVolume, 1, reverbDuration2);
      sourceReverb.start(startAt, startTime, duration);
      soundObject.sourceReverb = sourceReverb;
      return fadeInAndReturn();
      function fadeInAndReturn() {
        if (fadeInDuration == null) return soundObject;
        fadeIn(soundObject.source, volume, fadeInDuration);
        if (soundObject.sourceReverb) fadeIn(soundObject.sourceReverb, reverbVolume, fadeInDuration);
        return soundObject;
      }
    }
    function getSoundStamp(soundName) {
      const stamp = soundStamps[soundName];
      if (stamp) return stamp;
      else throw new Error(`Cannot return sound stamp for strange new sound ${soundName}!`);
    }
    function getStampDuration(stamp) {
      return stamp[1] - stamp[0];
    }
    function createBufferSource(volume, playbackRate = 1, reverbDurationSecs) {
      const source = audioContext.createBufferSource();
      if (audioDecodedBuffer == null) throw new Error("audioDecodedBuffer should never be undefined! This usually happens when soundspritesheet.mp3 starts loading but the document finishes loading in the middle of the audio loading.");
      source.buffer = audioDecodedBuffer;
      const nodes = [];
      const gain = generateGainNode(audioContext, volume);
      nodes.push(gain);
      source.gainNode = gain;
      if (reverbDurationSecs != null) {
        const convolver = generateConvolverNode(audioContext, reverbDurationSecs);
        nodes.push(convolver);
      }
      source.playbackRate.value = playbackRate;
      connectSourceToDestinationWithNodes(source, audioContext, nodes);
      return source;
    }
    function generateConvolverNode(audioContext2, durationSecs) {
      const impulse = impulseResponse(durationSecs);
      return new ConvolverNode(audioContext2, { buffer: impulse });
    }
    function generateGainNode(audioContext2, volume) {
      if (volume > 4) {
        console.error(`Gain was DANGEROUSLY set to ${volume}!!!! Resetting to 1.`);
        volume = 1;
      }
      const gainNode = audioContext2.createGain();
      gainNode.gain.value = volume;
      return gainNode;
    }
    function impulseResponse(duration) {
      const decay = 2;
      const sampleRate = audioContext.sampleRate;
      const length = sampleRate * duration;
      const impulse = audioContext.createBuffer(1, length, sampleRate);
      const IR = impulse.getChannelData(0);
      for (let i = 0; i < length; i++) IR[i] = (2 * Math.random() - 1) * Math.pow(1 - i / length, decay);
      return impulse;
    }
    function connectSourceToDestinationWithNodes(source, context, nodeList) {
      let currentConnection = source;
      for (let i = 0; i < nodeList.length; i++) {
        const thisNode = nodeList[i];
        currentConnection.connect(thisNode);
        currentConnection = thisNode;
      }
      currentConnection.connect(context.destination);
    }
    function fadeIn(source, targetVolume, fadeDuration) {
      if (!source?.gainNode) throw new Error("Source or gain node not provided");
      const currentTime = audioContext.currentTime;
      source.gainNode.gain.setValueAtTime(0, currentTime);
      source.gainNode.gain.linearRampToValueAtTime(targetVolume, currentTime + fadeDuration / 1e3);
    }
    function fadeOut(source, durationMillis) {
      if (!source?.gainNode) throw new Error("Source or gain node not provided");
      const durationSecs = durationMillis / 1e3;
      const currentTime = audioContext.currentTime;
      const endTime = currentTime + durationSecs;
      source.gainNode.gain.setValueAtTime(source.gainNode.gain.value, currentTime);
      source.gainNode.gain.linearRampToValueAtTime(0, endTime);
      setTimeout(() => {
        source.stop();
      }, durationMillis);
    }
    async function playSound_move(distanceMoved, dampen) {
      await sleepIfSoundsPlayedTooRapidly();
      const bell = distanceMoved >= bellDist;
      const dampener = dampen && bell ? amountToDampenSkippedBell : dampen ? amountToDampenSkippedMoves : 1;
      const volume = 1 * dampener;
      let { reverbVolume, reverbDuration: reverbDuration2 } = calculateReverbVolDurFromDistance(distanceMoved);
      reverbVolume *= dampener;
      playSound("move", { volume, reverbVolume, reverbDuration: reverbDuration2 });
      if (bell) {
        const bellVolume = 0.6 * dampener;
        playSound("bell", bellVolume);
      }
      timeLastMoveSoundPlayed = Date.now();
    }
    async function sleepIfSoundsPlayedTooRapidly() {
      const timeSinceLastMoveSoundPlayed = Date.now() - timeLastMoveSoundPlayed;
      if (timeSinceLastMoveSoundPlayed >= millisBetwMoveSounds) return;
      const timeLeft = millisBetwMoveSounds - timeSinceLastMoveSoundPlayed;
      await main2.sleep(timeLeft);
    }
    function playSound_capture(distanceMoved, dampen) {
      const bell = distanceMoved >= bellDist;
      const dampener = dampen && bell ? amountToDampenSkippedBell : dampen ? amountToDampenSkippedMoves : 1;
      const volume = 1 * dampener;
      let { reverbVolume, reverbDuration: reverbDuration2 } = calculateReverbVolDurFromDistance(distanceMoved);
      reverbVolume *= dampener;
      playSound("capture", { volume, reverbVolume, reverbDuration: reverbDuration2 });
      if (distanceMoved >= bellDist) {
        const bellVolume = 0.6 * dampener;
        playSound("bell", bellVolume);
      }
    }
    function calculateReverbVolDurFromDistance(distanceMoved) {
      const x = (distanceMoved - minReverbDist) / (maxReverbDist - minReverbDist);
      if (x <= 0) return { reverbVolume: null, reverbDuration: null };
      else if (x >= 1) return { reverbVolume: maxReverbVol, reverbDuration };
      function equation(x2) {
        return x2;
      }
      const y = equation(x);
      const reverbVolume = maxReverbVol * y;
      return { reverbVolume, reverbDuration };
    }
    function playSound_gamestart() {
      return playSound("gamestart", { volume: 0.4 });
    }
    function playSound_win(delay) {
      return playSound("win", { volume: 0.7, delay });
    }
    function playSound_draw(delay) {
      return playSound("draw", { volume: 0.7, delay });
    }
    function playSound_loss(delay) {
      return playSound("loss", { volume: 0.7, delay });
    }
    function playSound_lowtime() {
      return playSound("lowtime");
    }
    function playSound_drum() {
      const oneOrTwo = Math.random() > 0.5 ? 1 : 2;
      const soundName = `drum${oneOrTwo}`;
      return playSound(soundName, { volume: 0.7 });
    }
    function playSound_tick({ volume, fadeInDuration, offset } = {}) {
      return playSound("tick", { volume, offset, fadeInDuration });
    }
    function playSound_ticking({ fadeInDuration, offset } = {}) {
      return playSound("ticking", { volume: 0.18, offset, fadeInDuration });
    }
    function playSound_viola_c3({ volume } = {}) {
      return playSound("viola_staccato_c3", { volume });
    }
    function playSound_violin_c4() {
      return playSound("violin_staccato_c4", { volume: 0.9 });
    }
    function playSound_marimba() {
      const soft = Math.random() > 0.15 ? "_soft" : "";
      const audioName = `marimba_c2${soft}`;
      return playSound(audioName, { volume: 0.4 });
    }
    function playSound_base() {
      return playSound("base_staccato_c2", { volume: 0.8 });
    }
    return Object.freeze({
      getAudioContext,
      initAudioContext,
      playSound_gamestart,
      playSound_move,
      playSound_capture,
      playSound_lowtime,
      playSound_win,
      playSound_draw,
      // playSound_drawOffer,
      playSound_loss,
      playSound_drum,
      playSound_tick,
      playSound_ticking,
      playSound_viola_c3,
      playSound_violin_c4,
      playSound_marimba,
      playSound_base
    });
  }();

  // src/client/scripts/game/gui/style.mjs
  var style = function() {
    const element_style = document.getElementById("style");
    let navigationStyle;
    function addClass(element, className) {
      element.classList.add(className);
    }
    function removeClass(element, className) {
      element.classList.remove(className);
    }
    function reinstateClass(element, className) {
      removeClass(element, className);
      addClass(element, className);
    }
    function hideElement(element) {
      addClass(element, "hidden");
    }
    function revealElement(element) {
      removeClass(element, "hidden");
    }
    function fadeIn1s(element) {
      revealElement(element);
      reinstateClass(element, "fade-in-2_3s");
      if (!element.fadeIn1sLayers) element.fadeIn1sLayers = 1;
      else element.fadeIn1sLayers++;
      setTimeout(() => {
        element.fadeIn1sLayers--;
        if (element.fadeIn1sLayers > 0) return;
        delete element.fadeIn1sLayers;
        removeClass(element, "fade-in-2_3s");
      }, 1e3);
    }
    function fadeOut1s(element) {
      revealElement(element);
      reinstateClass(element, "fade-out-2_3s");
      if (!element.fadeOut1sLayers) element.fadeOut1sLayers = 1;
      else element.fadeOut1sLayers++;
      setTimeout(() => {
        element.fadeOut1sLayers--;
        if (element.fadeOut1sLayers > 0) return;
        delete element.fadeOut1sLayers;
        removeClass(element, "fade-out-2_3s");
        hideElement(element);
      }, 1e3);
    }
    function setNavStyle(cssStyle) {
      navigationStyle = cssStyle;
      onStyleChange();
    }
    function onStyleChange() {
      updateJavascriptStyling();
    }
    function updateJavascriptStyling() {
      element_style.innerHTML = navigationStyle;
    }
    function getChildrenTextContents(parentElement) {
      const children = parentElement.children;
      const textContents = [];
      for (let i = 0; i < children.length; i++) {
        textContents.push(children[i].textContent);
      }
      return textContents;
    }
    return Object.freeze({
      hideElement,
      revealElement,
      setNavStyle,
      fadeIn1s,
      fadeOut1s,
      getChildrenTextContents
    });
  }();

  // src/client/scripts/game/rendering/texture.mjs
  var texture = function() {
    function loadTexture(elementID, { useMipmaps = false } = {}) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const textureElement = document.getElementById(elementID);
      if (textureElement == null) return console.error(`Unable to find of document texture element with id '${elementID}'!`);
      const texture2 = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture2);
      const level = 0;
      const internalFormat = gl.RGBA;
      const srcFormat = gl.RGBA;
      const srcType = gl.UNSIGNED_BYTE;
      gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, textureElement);
      const powerOfTwo = math2.isPowerOfTwo(textureElement.offsetWidth) && math2.isPowerOfTwo(textureElement.offsetHeight);
      if (!powerOfTwo && useMipmaps) console.log(`Image ID ${elementID} dimensions is not a power of two! Unable to use mipmaps. Dimensions: ${textureElement.offsetWidth}x${textureElement.offsetHeight}`);
      if (useMipmaps && powerOfTwo) gl.generateMipmap(gl.TEXTURE_2D);
      else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      }
      gl.bindTexture(gl.TEXTURE_2D, null);
      return texture2;
    }
    return Object.freeze({
      loadTexture
    });
  }();

  // src/client/scripts/game/rendering/transition.mjs
  var transition2 = function() {
    const teleportHistory = [];
    const historyCap = 20;
    const baseSpeed = 600;
    const speedPerE = 70;
    const perspectiveMultiplier = 1.3;
    let speed;
    const maxPanTelDistB4Teleport = 90;
    const panTelSpeed = 800;
    let startTime;
    let isZoomOut;
    let isPanTel;
    let startCoords;
    let endCoords;
    let diffCoords;
    let startScale;
    let endScale;
    let startE;
    let endE;
    let diffE;
    let startWorldSpace;
    let endWorldSpace;
    let diffWorldSpace;
    let isTeleporting = false;
    let secondTeleport;
    function teleport(tel1, tel2, ignoreHistory) {
      if (!ignoreHistory) pushToTelHistory({ endCoords: movement.getBoardPos(), endScale: movement.getBoardScale(), isPanTel: false });
      secondTeleport = tel2;
      startCoords = movement.getBoardPos();
      startScale = movement.getBoardScale();
      endCoords = tel1.endCoords;
      endScale = tel1.endScale;
      startTime = performance.now();
      isZoomOut = endScale < startScale;
      isPanTel = false;
      if (isZoomOut) {
        startWorldSpace = [0, 0];
        endWorldSpace = math2.convertCoordToWorldSpace(startCoords, endCoords, endScale);
      } else {
        startWorldSpace = math2.convertCoordToWorldSpace(endCoords);
        endWorldSpace = [0, 0];
      }
      const diffX = endWorldSpace[0] - startWorldSpace[0];
      const diffY = endWorldSpace[1] - startWorldSpace[1];
      diffWorldSpace = [diffX, diffY];
      startE = Math.log(startScale);
      endE = Math.log(endScale);
      diffE = endE - startE;
      const multiplier = perspective2.getEnabled() ? perspectiveMultiplier : 1;
      speed = baseSpeed * multiplier + Math.abs(diffE) * speedPerE * multiplier;
      isTeleporting = true;
      movement.eraseMomentum();
    }
    function update() {
      if (!isTeleporting) return;
      main2.renderThisFrame();
      const elapsedTime = performance.now() - startTime;
      if (elapsedTime >= speed) {
        finish();
        return;
      }
      const equaX = elapsedTime / speed;
      const equaY = -0.5 * Math.cos(Math.PI * equaX) + 0.5;
      if (!isPanTel) updateNormal(equaY);
      else updatePanTel(equaX, equaY);
    }
    function updateNormal(equaY) {
      const newE = startE + diffE * equaY;
      const newScale = Math.pow(Math.E, newE);
      movement.setBoardScale(newScale, "pidough");
      const targetCoords = isZoomOut ? startCoords : endCoords;
      const newWorldX = startWorldSpace[0] + diffWorldSpace[0] * equaY;
      const newWorldY = startWorldSpace[1] + diffWorldSpace[1] * equaY;
      const boardScale = movement.getBoardScale();
      const newX = targetCoords[0] - newWorldX / boardScale;
      const newY = targetCoords[1] - newWorldY / boardScale;
      movement.setBoardPos([newX, newY], "pidough");
    }
    function updatePanTel(equaX, equaY) {
      const maxDist = maxPanTelDistB4Teleport / movement.getBoardScale();
      const greaterThanMaxDist = Math.abs(diffCoords[0]) > maxDist || Math.abs(diffCoords[1]) > maxDist;
      let newX;
      let newY;
      if (!greaterThanMaxDist) {
        const addX = (endCoords[0] - startCoords[0]) * equaY;
        const addY = (endCoords[1] - startCoords[1]) * equaY;
        newX = startCoords[0] + addX;
        newY = startCoords[1] + addY;
      } else {
        const firstHalf = equaX < 0.5;
        const neg = firstHalf ? 1 : -1;
        const actualEquaY = firstHalf ? equaY : 1 - equaY;
        let diffX = diffCoords[0];
        const xRatio = maxDist / Math.abs(diffX);
        let diffY = diffCoords[1];
        const yRatio = maxDist / Math.abs(diffY);
        let ratio = xRatio < yRatio ? xRatio : yRatio;
        ratio = ratio > 1 ? ratio : ratio;
        diffX *= ratio;
        diffY *= ratio;
        const target = firstHalf ? startCoords : endCoords;
        const addX = diffX * actualEquaY * neg;
        const addY = diffY * actualEquaY * neg;
        newX = target[0] + addX;
        newY = target[1] + addY;
      }
      movement.setBoardPos([newX, newY], "pidough");
    }
    function finish() {
      movement.setBoardPos(endCoords, "pidough");
      movement.setBoardScale(endScale, "pidough");
      if (secondTeleport) {
        teleport(secondTeleport, void 0, true);
      } else isTeleporting = false;
    }
    function panTel(startCoord, endCoord, ignoreHistory, speeed = panTelSpeed) {
      if (!ignoreHistory) pushToTelHistory({ isPanTel: true, endCoords: movement.getBoardPos() });
      startTime = performance.now();
      startCoords = startCoord;
      endCoords = endCoord;
      const boardScale = movement.getBoardScale();
      startScale = boardScale;
      endScale = boardScale;
      const diffX = endCoords[0] - startCoords[0];
      const diffY = endCoords[1] - startCoords[1];
      diffCoords = [diffX, diffY];
      speed = speeed;
      isTeleporting = true;
      isPanTel = true;
      movement.eraseMomentum();
    }
    function pushToTelHistory(tel) {
      teleportHistory.push(tel);
      if (teleportHistory.length > historyCap) teleportHistory.shift();
    }
    function telToPrevTel() {
      const previousTel = teleportHistory.pop();
      if (!previousTel) return;
      if (previousTel.isPanTel) {
        panTel(movement.getBoardPos(), previousTel.endCoords, true);
      } else {
        const thisArea = {
          coords: previousTel.endCoords,
          scale: previousTel.endScale,
          boundingBox: math2.getBoundingBoxOfBoard(previousTel.endCoords, previousTel.endScale, camera.getScreenBoundingBox())
        };
        area.initTelFromArea(thisArea, true);
      }
    }
    function eraseTelHist() {
      teleportHistory.length = 0;
    }
    function areWeTeleporting() {
      return isTeleporting;
    }
    return Object.freeze({
      areWeTeleporting,
      teleport,
      update,
      telToPrevTel,
      eraseTelHist,
      panTel
    });
  }();

  // src/client/scripts/game/rendering/area.mjs
  var area = function() {
    const padding = 0.03;
    const paddingMiniimage = 0.2;
    const capScale = 1.4;
    const iterationsToRecalcPadding = 10;
    function calculateFromCoordsList(coordsList, existingBox) {
      if (!coordsList) return console.error("Cannot calculate area from an undefined coords list.");
      if (coordsList.length === 0) return console.error("Cannot calculate area from an empty coords list.");
      let box = math2.getBoxFromCoordsList(coordsList);
      if (existingBox) box = math2.mergeBoundingBoxes(box, existingBox);
      return calculateFromUnpaddedBox(box);
    }
    function calculateFromUnpaddedBox(box) {
      if (!box) return console.error("Cannot calculate area from an undefined box.");
      const paddedBox = applyPaddingToBox(box);
      return calculateFromBox(paddedBox);
    }
    function applyPaddingToBox(box) {
      if (!box) {
        console.error("Cannot apply padding to an undefined box.");
        return box;
      }
      const boxCopy = math2.deepCopyObject(box);
      const topNavHeight = camera2.getPIXEL_HEIGHT_OF_TOP_NAV();
      const bottomNavHeight = camera2.getPIXEL_HEIGHT_OF_BOTTOM_NAV();
      const navHeight = topNavHeight + bottomNavHeight;
      const canvasHeightVirtualSubNav = camera2.getCanvasHeightVirtualPixels() - navHeight;
      const squareCenter = board2.gsquareCenter();
      boxCopy.left -= squareCenter;
      boxCopy.right += 1 - squareCenter;
      boxCopy.bottom -= squareCenter;
      boxCopy.top += 1 - squareCenter;
      let paddedBox = math2.deepCopyObject(boxCopy);
      let scale = calcScaleToMatchSides(paddedBox);
      if (iterationsToRecalcPadding <= 0) {
        console.error("iterationsToRecalcPadding must be greater than 0!");
        return boxCopy;
      }
      for (let i = 0; i < iterationsToRecalcPadding; i++) {
        const paddingToUse = scale < movement.getScale_When1TileIs1Pixel_Virtual() ? paddingMiniimage : padding;
        const paddingHorzPixels = camera2.getCanvasWidthVirtualPixels() * paddingToUse;
        const paddingVertPixels = canvasHeightVirtualSubNav * paddingToUse + bottomNavHeight;
        const paddingHorzWorld = math2.convertPixelsToWorldSpace_Virtual(paddingHorzPixels);
        const paddingVertWorld = math2.convertPixelsToWorldSpace_Virtual(paddingVertPixels);
        const paddingHorz = paddingHorzWorld / scale;
        const paddingVert = paddingVertWorld / scale;
        paddedBox = addPaddingToBoundingBox(boxCopy, paddingHorz, paddingVert);
        scale = calcScaleToMatchSides(paddedBox);
      }
      return paddedBox;
    }
    function calculateFromBox(box) {
      if (!box) return console.error("Cannot calculate area from an undefined box.");
      const xHalfLength = (box.right - box.left) / 2;
      const yHalfLength = (box.top - box.bottom) / 2;
      const centerX = box.left + xHalfLength;
      const centerY = box.bottom + yHalfLength;
      const newBoardPos = [centerX, centerY];
      const newScale = calcScaleToMatchSides(box);
      box = math2.getBoundingBoxOfBoard(newBoardPos, newScale, camera2.getScreenBoundingBox());
      math2;
      return {
        coords: newBoardPos,
        scale: newScale,
        boundingBox: box
      };
    }
    function calcScaleToMatchSides(boundingBox) {
      if (!boundingBox) return console.log("Cannot calc scale to match sides of an undefined box.");
      const xHalfLength = (boundingBox.right - boundingBox.left) / 2;
      const yHalfLength = (boundingBox.top - boundingBox.bottom) / 2;
      const xScale = camera2.getScreenBoundingBox(false).right / xHalfLength;
      const yScale = camera2.getScreenBoundingBox(false).top / yHalfLength;
      let newScale = xScale < yScale ? xScale : yScale;
      if (newScale > capScale) newScale = capScale;
      return newScale;
    }
    function addPaddingToBoundingBox(boundingBox, horzPad, vertPad) {
      return {
        left: boundingBox.left - horzPad,
        right: boundingBox.right + horzPad,
        bottom: boundingBox.bottom - vertPad,
        top: boundingBox.top + vertPad
      };
    }
    function initTelFromCoordsList(coordsList) {
      if (!coordsList) return console.error("Cannot init teleport from an undefined coords list.");
      if (coordsList.length === 0) return console.error("Cannot init teleport from an empty coords list.");
      const box = math2.getBoxFromCoordsList(coordsList);
      initTelFromUnpaddedBox(box);
    }
    function initTelFromUnpaddedBox(box) {
      if (!box) return console.error("Cannot init teleport from an undefined box.");
      const thisArea = calculateFromUnpaddedBox(box);
      initTelFromArea(thisArea);
    }
    function initTelFromArea(thisArea, ignoreHistory) {
      if (!thisArea) return console.error("Cannot init teleport from an undefined area.");
      const thisAreaBox = thisArea.boundingBox;
      const startCoords = movement.getBoardPos();
      const endCoords = thisArea.coords;
      const currentBoardBoundingBox = board2.gboundingBox();
      const isAZoomOut = thisArea.scale < movement.getBoardScale();
      let firstArea;
      if (isAZoomOut) {
        if (!math2.boxContainsSquare(thisAreaBox, startCoords)) firstArea = calculateFromCoordsList([startCoords], thisAreaBox);
      } else {
        if (!math2.boxContainsSquare(currentBoardBoundingBox, endCoords)) firstArea = calculateFromCoordsList([endCoords], currentBoardBoundingBox);
      }
      const tel1 = firstArea ? { endCoords: firstArea.coords, endScale: firstArea.scale } : void 0;
      const tel2 = { endCoords: thisArea.coords, endScale: thisArea.scale };
      if (tel1) transition2.teleport(tel1, tel2, ignoreHistory);
      else transition2.teleport(tel2, null, ignoreHistory);
    }
    function getAreaOfAllPieces(gamefile2) {
      if (!gamefile2) return console.error("Cannot get the area of all pieces of an undefined game.");
      if (!gamefile2.startSnapshot.box) return console.error("Cannot get area of all pieces when gamefile has no startSnapshot.box property!");
      return calculateFromUnpaddedBox(gamefile2.startSnapshot.box);
    }
    function initStartingAreaBox(gamefile2) {
      const startingPosition = gamefile2.startSnapshot.position;
      const coordsList = gamefileutility2.getCoordsOfAllPiecesByKey(startingPosition);
      const box = math2.getBoxFromCoordsList(coordsList);
      gamefile2.startSnapshot.box = box;
    }
    return Object.freeze({
      calculateFromCoordsList,
      calculateFromUnpaddedBox,
      getAreaOfAllPieces,
      initStartingAreaBox,
      initTelFromUnpaddedBox,
      initTelFromCoordsList,
      initTelFromArea
    });
  }();

  // src/client/scripts/game/gui/guinavigation.mjs
  var guinavigation = function() {
    const element_Navigation = document.getElementById("navigation");
    const element_Recenter = document.getElementById("recenter");
    const element_Expand = document.getElementById("expand");
    const element_Back = document.getElementById("back");
    const element_CoordsX = document.getElementById("x");
    const element_CoordsY = document.getElementById("y");
    const element_moveRewind = document.getElementById("move-left");
    const element_moveForward = document.getElementById("move-right");
    const element_pause = document.getElementById("pause");
    const timeToHoldMillis = 250;
    const intervalToRepeat = 40;
    const minimumRewindIntervalMillis = 20;
    let lastRewindOrForward = 0;
    let leftArrowTimeoutID;
    let leftArrowIntervalID;
    let touchIsInsideLeft = false;
    let rightArrowTimeoutID;
    let rightArrowIntervalID;
    let touchIsInsideRight = false;
    let rewindIsLocked = false;
    const durationToLockRewindAfterMoveForwardingMillis = 750;
    function open() {
      style.revealElement(element_Navigation);
      initListeners_Navigation();
      update_MoveButtons();
    }
    function close() {
      style.hideElement(element_Navigation);
      closeListeners_Navigation();
    }
    function updateElement_Coords() {
      const boardPos = movement.getBoardPos();
      element_CoordsX.textContent = board2.gtile_MouseOver_Int() ? board2.gtile_MouseOver_Int()[0] : Math.floor(boardPos[0] + board2.gsquareCenter());
      element_CoordsY.textContent = board2.gtile_MouseOver_Int() ? board2.gtile_MouseOver_Int()[1] : Math.floor(boardPos[1] + board2.gsquareCenter());
    }
    function initListeners_Navigation() {
      element_Navigation.addEventListener("mousedown", input2.doIgnoreMouseDown);
      element_Navigation.addEventListener("touchstart", input2.doIgnoreMouseDown);
      element_Recenter.addEventListener("click", callback_Recenter);
      element_Expand.addEventListener("click", callback_Expand);
      element_Back.addEventListener("click", callback_Back);
      element_moveRewind.addEventListener("click", callback_MoveRewind);
      element_moveRewind.addEventListener("mousedown", callback_MoveRewindMouseDown);
      element_moveRewind.addEventListener("mouseleave", callback_MoveRewindMouseLeave);
      element_moveRewind.addEventListener("mouseup", callback_MoveRewindMouseUp);
      element_moveRewind.addEventListener("touchstart", callback_MoveRewindTouchStart);
      element_moveRewind.addEventListener("touchmove", callback_MoveRewindTouchMove);
      element_moveRewind.addEventListener("touchend", callback_MoveRewindTouchEnd);
      element_moveRewind.addEventListener("touchcancel", callback_MoveRewindTouchEnd);
      element_moveForward.addEventListener("click", callback_MoveForward);
      element_moveForward.addEventListener("mousedown", callback_MoveForwardMouseDown);
      element_moveForward.addEventListener("mouseleave", callback_MoveForwardMouseLeave);
      element_moveForward.addEventListener("mouseup", callback_MoveForwardMouseUp);
      element_moveForward.addEventListener("touchstart", callback_MoveForwardTouchStart);
      element_moveForward.addEventListener("touchmove", callback_MoveForwardTouchMove);
      element_moveForward.addEventListener("touchend", callback_MoveForwardTouchEnd);
      element_moveForward.addEventListener("touchcancel", callback_MoveForwardTouchEnd);
      element_pause.addEventListener("click", callback_Pause);
    }
    function closeListeners_Navigation() {
      element_Navigation.removeEventListener("mousedown", input2.doIgnoreMouseDown);
      element_Navigation.removeEventListener("touchstart", input2.doIgnoreMouseDown);
      element_Recenter.removeEventListener("click", callback_Recenter);
      element_Expand.removeEventListener("click", callback_Expand);
      element_Back.removeEventListener("click", callback_Back);
      element_moveRewind.removeEventListener("click", callback_MoveRewind);
      element_moveRewind.removeEventListener("mousedown", callback_MoveRewindMouseDown);
      element_moveRewind.removeEventListener("mouseleave", callback_MoveRewindMouseLeave);
      element_moveRewind.removeEventListener("mouseup", callback_MoveRewindMouseUp);
      element_moveRewind.removeEventListener("touchstart", callback_MoveRewindTouchStart);
      element_moveRewind.removeEventListener("touchmove", callback_MoveRewindTouchMove);
      element_moveRewind.removeEventListener("touchend", callback_MoveRewindTouchEnd);
      element_moveRewind.removeEventListener("touchcancel", callback_MoveRewindTouchEnd);
      element_moveForward.removeEventListener("click", callback_MoveForward);
      element_moveForward.removeEventListener("mousedown", callback_MoveForwardMouseDown);
      element_moveForward.removeEventListener("mouseleave", callback_MoveForwardMouseLeave);
      element_moveForward.removeEventListener("mouseup", callback_MoveForwardMouseUp);
      element_moveForward.removeEventListener("touchstart", callback_MoveForwardTouchStart);
      element_moveForward.removeEventListener("touchmove", callback_MoveForwardTouchMove);
      element_moveForward.removeEventListener("touchend", callback_MoveForwardTouchEnd);
      element_moveForward.removeEventListener("touchcancel", callback_MoveForwardTouchEnd);
      element_Back.removeEventListener("click", callback_Pause);
    }
    function callback_Back(event2) {
      event2 = event2 || window.event;
      transition.telToPrevTel();
    }
    function callback_Expand(event2) {
      event2 = event2 || window.event;
      const allCoords = gamefileutility.getCoordsOfAllPieces(game2.getGamefile());
      area.initTelFromCoordsList(allCoords);
    }
    function callback_Recenter(event2) {
      event2 = event2 || window.event;
      const boundingBox = game2.getGamefile().startSnapshot.box;
      if (!boundingBox) return console.error("Cannot recenter when the bounding box of the starting position is undefined!");
      area.initTelFromUnpaddedBox(boundingBox);
    }
    function callback_MoveRewind(event2) {
      event2 = event2 || window.event;
      if (rewindIsLocked) return;
      if (!isItOkayToRewindOrForward()) return;
      lastRewindOrForward = Date.now();
      movesscript2.rewindMove();
    }
    function callback_MoveForward(event2) {
      event2 = event2 || window.event;
      if (!isItOkayToRewindOrForward()) return;
      lastRewindOrForward = Date.now();
      movesscript2.forwardMove();
    }
    function isItOkayToRewindOrForward() {
      const timeSinceLastRewindOrForward = Date.now() - lastRewindOrForward;
      return timeSinceLastRewindOrForward >= minimumRewindIntervalMillis;
    }
    function update_MoveButtons() {
      const decrementingLegal = movesscript2.isDecrementingLegal(game2.getGamefile());
      const incrementingLegal = movesscript2.isIncrementingLegal(game2.getGamefile());
      if (decrementingLegal) element_moveRewind.classList.remove("opacity-0_5");
      else element_moveRewind.classList.add("opacity-0_5");
      if (incrementingLegal) element_moveForward.classList.remove("opacity-0_5");
      else element_moveForward.classList.add("opacity-0_5");
    }
    function callback_Pause(event2) {
      event2 = event2 || window.event;
      guipause2.open();
    }
    function callback_MoveRewindMouseDown() {
      leftArrowTimeoutID = setTimeout(() => {
        leftArrowIntervalID = setInterval(() => {
          callback_MoveRewind();
        }, intervalToRepeat);
      }, timeToHoldMillis);
    }
    function callback_MoveRewindMouseLeave() {
      clearTimeout(leftArrowTimeoutID);
      clearInterval(leftArrowIntervalID);
    }
    function callback_MoveRewindMouseUp() {
      clearTimeout(leftArrowTimeoutID);
      clearInterval(leftArrowIntervalID);
    }
    function callback_MoveForwardMouseDown() {
      rightArrowTimeoutID = setTimeout(() => {
        rightArrowIntervalID = setInterval(() => {
          callback_MoveForward();
        }, intervalToRepeat);
      }, timeToHoldMillis);
    }
    function callback_MoveForwardMouseLeave() {
      clearTimeout(rightArrowTimeoutID);
      clearInterval(rightArrowIntervalID);
    }
    function callback_MoveForwardMouseUp() {
      clearTimeout(rightArrowTimeoutID);
      clearInterval(rightArrowIntervalID);
    }
    function callback_MoveRewindTouchStart() {
      touchIsInsideLeft = true;
      leftArrowTimeoutID = setTimeout(() => {
        if (!touchIsInsideLeft) return;
        leftArrowIntervalID = setInterval(() => {
          callback_MoveRewind();
        }, intervalToRepeat);
      }, timeToHoldMillis);
    }
    function callback_MoveRewindTouchMove(event2) {
      event2 = event2 || window.event;
      if (!touchIsInsideLeft) return;
      const touch = event2.touches[0];
      const rect = element_moveRewind.getBoundingClientRect();
      if (touch.clientX > rect.left && touch.clientX < rect.right && touch.clientY > rect.top && touch.clientY < rect.bottom) return;
      touchIsInsideLeft = false;
      clearTimeout(leftArrowTimeoutID);
      clearInterval(leftArrowIntervalID);
    }
    function callback_MoveRewindTouchEnd() {
      touchIsInsideLeft = false;
      clearTimeout(leftArrowTimeoutID);
      clearInterval(leftArrowIntervalID);
    }
    function callback_MoveForwardTouchStart() {
      touchIsInsideRight = true;
      rightArrowTimeoutID = setTimeout(() => {
        if (!touchIsInsideRight) return;
        rightArrowIntervalID = setInterval(() => {
          callback_MoveForward();
        }, intervalToRepeat);
      }, timeToHoldMillis);
    }
    function callback_MoveForwardTouchMove(event2) {
      event2 = event2 || window.event;
      if (!touchIsInsideRight) return;
      const touch = event2.touches[0];
      const rect = element_moveForward.getBoundingClientRect();
      if (touch.clientX > rect.left && touch.clientX < rect.right && touch.clientY > rect.top && touch.clientY < rect.bottom) return;
      touchIsInsideRight = false;
      clearTimeout(rightArrowTimeoutID);
      clearInterval(rightArrowIntervalID);
    }
    function callback_MoveForwardTouchEnd() {
      touchIsInsideRight = false;
      clearTimeout(rightArrowTimeoutID);
      clearInterval(rightArrowIntervalID);
    }
    function lockRewind() {
      rewindIsLocked = true;
      lockLayers++;
      setTimeout(() => {
        lockLayers--;
        if (lockLayers > 0) return;
        rewindIsLocked = false;
      }, durationToLockRewindAfterMoveForwardingMillis);
    }
    let lockLayers = 0;
    function isRewindButtonLocked() {
      return rewindIsLocked;
    }
    return Object.freeze({
      open,
      close,
      updateElement_Coords,
      update_MoveButtons,
      callback_Pause,
      lockRewind,
      isRewindButtonLocked
    });
  }();

  // src/client/scripts/game/chess/movesscript.mjs
  var movesscript2 = function() {
    function update() {
      testIfRewindMove();
      testIfForwardMove();
    }
    function testIfRewindMove() {
      if (!input2.isKeyDown("arrowleft")) return;
      if (guinavigation.isRewindButtonLocked()) return;
      rewindMove();
    }
    function testIfForwardMove() {
      if (!input2.isKeyDown("arrowright")) return;
      forwardMove();
    }
    function rewindMove() {
      if (game.getGamefile().mesh.locked) return statustext2.pleaseWaitForTask();
      if (!isDecrementingLegal(game.getGamefile())) return stats.showMoves();
      main2.renderThisFrame();
      movepiece.rewindMove(game.getGamefile(), { removeMove: false });
      selection2.unselectPiece();
      guinavigation.update_MoveButtons();
      stats.showMoves();
    }
    function forwardMove() {
      if (game.getGamefile().mesh.locked) return statustext2.pleaseWaitForTask();
      if (!isIncrementingLegal(game.getGamefile())) return stats.showMoves();
      const move = getMoveOneForward();
      movepiece.makeMove(game.getGamefile(), move, { flipTurn: false, recordMove: false, pushClock: false, doGameOverChecks: false, updateProperties: false });
      guinavigation.update_MoveButtons();
      stats.showMoves();
    }
    function getMoveOneForward() {
      const moveIndex = game.getGamefile().moveIndex;
      const incrementedIndex = moveIndex + 1;
      return getMoveFromIndex(game.getGamefile().moves, incrementedIndex);
    }
    function isIncrementingLegal(gamefile2) {
      if (gamefile2 == null) throw new Error("Cannot ask if incrementing moves is legal when there's no gamefile.");
      const incrementedIndex = gamefile2.moveIndex + 1;
      return !isIndexOutOfRange(gamefile2.moves, incrementedIndex);
    }
    function isDecrementingLegal(gamefile2) {
      if (gamefile2 == null) throw new Error("Cannot ask if decrementing moves is legal when there's no gamefile.");
      const decrementedIndex = gamefile2.moveIndex - 1;
      return !isIndexOutOfRange(gamefile2.moves, decrementedIndex);
    }
    function isIndexOutOfRange(moves, index) {
      return index < -1 || index >= moves.length;
    }
    function getLastMove(moves) {
      const finalIndex = moves.length - 1;
      if (finalIndex < 0) return;
      return moves[finalIndex];
    }
    function getCurrentMove(gamefile2) {
      const index = gamefile2.moveIndex;
      if (index < 0) return;
      return gamefile2.moves[index];
    }
    function getMoveFromIndex(moves, index) {
      if (isIndexOutOfRange(moves, index)) return console.error("Cannot get next move when index overflow");
      return moves[index];
    }
    function areWeViewingLatestMove(gamefile2) {
      const moveIndex = gamefile2.moveIndex;
      return isIndexTheLastMove(gamefile2.moves, moveIndex);
    }
    function isIndexTheLastMove(moves, index) {
      const finalIndex = moves.length - 1;
      return index === finalIndex;
    }
    function getWhosTurnAtFront(gamefile2) {
      return getWhosTurnAtMoveIndex(gamefile2, gamefile2.moves.length - 1);
    }
    function getPlyCount(moves) {
      return moves.length;
    }
    function hasPieceMoved(gamefile2, coords) {
      for (const thisMove of gamefile2.moves) {
        if (math2.areCoordsEqual(thisMove.endCoords, coords)) return true;
      }
      return false;
    }
    function deleteLastMove(moves) {
      if (moves.length === 0) return console.error("Cannot delete last move when there are none");
      moves.pop();
    }
    function areMovesIn2DFormat(longmoves) {
      if (longmoves.length === 0) return false;
      return Array.isArray(longmoves[0]);
    }
    function convertMovesTo1DFormat(moves, results) {
      results.turn = "white";
      const moves1D = [];
      for (let a = 0; a < moves.length; a++) {
        const thisPair = moves[a];
        for (let b = 0; b < thisPair.length; b++) {
          const thisMove = thisPair[b];
          if (thisMove === null) results.turn = "black";
          else moves1D.push(thisMove);
        }
      }
      return moves1D;
    }
    function flagLastMoveAsCheck(gamefile2) {
      if (gamefile2.moves.length === 0) throw new Error("Cannot flag the game's last move as a 'check' when there are no moves.");
      const lastMove = getLastMove(gamefile2.moves);
      lastMove.check = true;
    }
    function flagLastMoveAsMate(gamefile2) {
      if (gamefile2.moves.length === 0) return;
      const lastMove = getLastMove(gamefile2.moves);
      lastMove.mate = true;
    }
    function isGameResignable(gamefile2) {
      return gamefile2.moves.length > 1;
    }
    function getColorThatPlayedMoveIndex(gamefile2, i) {
      if (i === -1) return console.error("Cannot get color that played move index when move index is -1.");
      const turnOrder = gamefile2.gameRules.turnOrder;
      const loopIndex = i % turnOrder.length;
      return turnOrder[loopIndex];
    }
    function getWhosTurnAtMoveIndex(gamefile2, moveIndex) {
      return getColorThatPlayedMoveIndex(gamefile2, moveIndex + 1);
    }
    function doesAnyPlayerGet2TurnsInARow(gamefile2) {
      const turnOrder = gamefile2.gameRules.turnOrder;
      for (let i = 0; i < turnOrder.length; i++) {
        const thisColor = turnOrder[i];
        const nextColorIndex = i === turnOrder.length - 1 ? 0 : i + 1;
        const nextColor = turnOrder[nextColorIndex];
        if (thisColor === nextColor) return true;
      }
      return false;
    }
    return Object.freeze({
      update,
      rewindMove,
      forwardMove,
      isIncrementingLegal,
      isDecrementingLegal,
      isIndexOutOfRange,
      getLastMove,
      getCurrentMove,
      getMoveFromIndex,
      areWeViewingLatestMove,
      isIndexTheLastMove,
      getWhosTurnAtFront,
      getPlyCount,
      hasPieceMoved,
      deleteLastMove,
      flagLastMoveAsCheck,
      flagLastMoveAsMate,
      areMovesIn2DFormat,
      convertMovesTo1DFormat,
      isGameResignable,
      getColorThatPlayedMoveIndex,
      getWhosTurnAtMoveIndex,
      doesAnyPlayerGet2TurnsInARow
    });
  }();

  // src/client/scripts/game/gui/stats.mjs
  var stats = {
    element_Statuses: document.getElementById("stats"),
    // Various statuses
    elementStatusMoveLooking: document.getElementById("status-move-looking"),
    elementStatusFPS: document.getElementById("status-fps"),
    elementStatusPiecesMesh: document.getElementById("status-pieces-mesh"),
    elementStatusRotateMesh: document.getElementById("status-rotate-mesh"),
    elementStatusCoords: document.getElementById("status-coords"),
    elementStatusMoves: document.getElementById("status-moves"),
    // When hideMoves() is called, it decrements this by 1.
    // If it's zero, it ACTUALLY hides the stat.
    // This makes it so we can keep using setTimeout even if we refresh it's visibility!
    visibilityWeight: 0,
    /**
     * Temporarily displays the move number in the corner of the screen.
     * @param {number} [durationSecs] The duration to show the move number. Default: 2.5
     */
    showMoves(durationSecs = 2.5) {
      if (main2.videoMode) return;
      stats.visibilityWeight++;
      stats.setTextContentOfMoves();
      setTimeout(stats.hideMoves, durationSecs * 1e3);
      if (stats.visibilityWeight === 1) style.revealElement(stats.elementStatusMoves);
    },
    hideMoves() {
      stats.visibilityWeight--;
      if (stats.visibilityWeight === 0) style.hideElement(stats.elementStatusMoves);
    },
    setTextContentOfMoves() {
      const currentPly = game.getGamefile().moveIndex + 1;
      const totalPlyCount = movesscript2.getPlyCount(game.getGamefile().moves);
      stats.elementStatusMoves.textContent = `${translations["move_counter"]} ${currentPly}/${totalPlyCount}`;
    },
    updateStatsCSS() {
      stats.element_Statuses.style = `top: ${camera2.getPIXEL_HEIGHT_OF_TOP_NAV()}px`;
    },
    showPiecesMesh() {
      if (main2.videoMode) return;
      style.revealElement(stats.elementStatusPiecesMesh);
    },
    updatePiecesMesh(percent) {
      const percentString = math.decimalToPercent(percent);
      stats.elementStatusPiecesMesh.textContent = `${translations["constructing_mesh"]} ${percentString}`;
    },
    hidePiecesMesh() {
      style.hideElement(stats.elementStatusPiecesMesh);
    },
    showFPS() {
      if (main2.videoMode) return;
      style.revealElement(stats.elementStatusFPS);
    },
    hideFPS() {
      style.hideElement(stats.elementStatusFPS);
    },
    updateFPS(fps) {
      if (!options2.isFPSOn()) return;
      const truncated = fps | 0;
      stats.elementStatusFPS.textContent = `FPS: ${truncated}`;
    },
    showRotateMesh() {
      if (main2.videoMode) return;
      style.revealElement(stats.elementStatusRotateMesh);
    },
    updateRotateMesh(percent) {
      const percentString = math.decimalToPercent(percent);
      stats.elementStatusRotateMesh.textContent = `${translations["rotating_mesh"]} ${percentString}`;
    },
    hideRotateMesh() {
      style.hideElement(stats.elementStatusRotateMesh);
    },
    // NO LONGER USED. These were for the aynchronious checkmate algorithm.
    // showMoveLooking() {
    //     if (main.videoMode) return;
    //     style.revealElement(stats.elementStatusMoveLooking);
    // },
    // updateMoveLooking(percent) {
    //     const percentString = math.decimalToPercent(percent);
    //     stats.showMoveLooking();
    //     stats.elementStatusMoveLooking.textContent = `Looking for moves... ${percentString}`;
    // },
    hideMoveLooking() {
      style.hideElement(stats.elementStatusMoveLooking);
    }
  };

  // src/client/scripts/game/rendering/coin.mjs
  var coin = function() {
    const locations = ["xxg", "cxhg", "dvsi", "wnnh", "bsfvl", "bciph", "xwui", "lprd", "bxksd", "brsvd", "bnesg", "beeud", "wst", "bqvoe", "qmch", "jshi", "yqyg", "rtja", "bjohd", "lrql", "oyqo", "bqxv", "btqta", "bdanl", "bjwxi", "byhah", "zyrk", "pdya", "vpka", "uqxd", "tgrk", "egzd", "bqdhi", "gcvh", "osae", "btrua", "bclih", "plgh", "bfmsl", "bsxza"];
    const encryption = "jdhagkleioqcfmnzxyptsuvrw";
    function appDat(gamefile2, currIndex, mesh, usingColoredTextures) {
      const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType("yellow");
      for (let i = 0; i < locations.length; i += 2) {
        const xString = locations[i];
        const x = decryptCoordinate(xString);
        const yString = locations[i + 1];
        const y = decryptCoordinate(yString);
        const thisLocation = [x, y];
        const coordDataOfPiece = bufferdata.getCoordDataOfTile_WithOffset(gamefile2.mesh.offset, thisLocation);
        const startX = coordDataOfPiece.startX;
        const startY = coordDataOfPiece.startY;
        const endX = coordDataOfPiece.endX;
        const endY = coordDataOfPiece.endY;
        const r = 1, g = 1, b = 1, a = 1;
        const data = usingColoredTextures ? bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a) : bufferdata.getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY);
        for (let a2 = 0; a2 < data.length; a2++) {
          mesh.data32[currIndex] = data[a2];
          mesh.data64[currIndex] = data[a2];
          currIndex++;
        }
      }
      return currIndex;
    }
    function decryptCoordinate(str) {
      let result = 0;
      let base = 1;
      const isNegative = str.startsWith("b");
      if (isNegative) {
        str = str.substring(1);
      }
      const shifted = shiftString(str, -3);
      for (let i = shifted.length - 1; i >= 0; i--) {
        const value = encryption.indexOf(shifted[i]);
        result += value * base;
        base *= 25;
      }
      result /= 3;
      return isNegative ? -result : result;
    }
    function shiftString(str, amt) {
      const length = str.length;
      const actualShift = -amt % length;
      return str.slice(actualShift) + str.slice(0, actualShift);
    }
    function getCoinCount() {
      return locations.length / 2;
    }
    return Object.freeze({
      appDat,
      getCoinCount
    });
  }();

  // src/client/scripts/game/rendering/shaders.mjs
  var shaders = function() {
    const pointSize = 1;
    const programs = {
      /** Renders meshes where each point has a color value.
       * 
       * Each point in the mesh must contain positional data (2 or 3 numbers)
       * followed by the color data (4 numbers).
       * @type {ShaderProgram}
       */
      colorProgram: void 0,
      /** 
       * Renders meshes with bound textures.
       * 
       * Each point in the mesh must contain positional data (2 or 3 numbers)
       * followed by the texture data (2 numbers).
       * @type {ShaderProgram}
       */
      textureProgram: void 0,
      /** 
       * Renders meshes with bound textures AND color values at each point.
       * This can be used to tint each point of the mesh a desired color.
       * 
       * Each point must contain the positional data (2 or 3 numbers),
       * followed by the texture data (2 numbers),
       * and lastly followed by the color data (4 numbers).
       * The meshes obviously use more memory than the other shader programs.
       * @type {ShaderProgram}
       */
      coloredTextureProgram: void 0,
      /** 
       * Renders meshes with bound textures AND tints the entire mesh a specific color.
       * This is more memory efficient than the colored texture program.
       * 
       * Each point must contain the positional data (2 or 3 numbers),
       * followed by the texture data (2 numbers).
       * Set the tint by updating the uniform `uVertexColor` before rendering by using gl.uniform4fv(),
       * or just by sending the uniform value into {@link BufferModel.render}
       * @type {ShaderProgram}
       */
      tintedTextureProgram: void 0
      // Renders textures with color
    };
    function initPrograms() {
      programs.colorProgram = createColorProgram();
      programs.textureProgram = createTextureProgram();
      programs.coloredTextureProgram = createColoredTextureProgram();
      programs.tintedTextureProgram = createTintedTextureProgram();
    }
    function createColorProgram() {
      const specifyPointSize = false;
      const pointSizeLine = specifyPointSize ? `gl_PointSize = ${(pointSize * camera.getPixelDensity()).toFixed(1)}; // Default: 7.0. Sets the point size of gl.POINTS` : "";
      const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec4 aVertexColor;

            uniform mat4 uWorldMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjMatrix;

            varying lowp vec4 vColor;

            void main() {
                gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
                vColor = aVertexColor;
                ${pointSizeLine}
            }
        `;
      const fsSource = `
            varying lowp vec4 vColor;

            void main() {
                gl_FragColor = vColor;
            }
        `;
      const program = createShaderProgram(vsSource, fsSource);
      return {
        program,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
          vertexColor: gl.getAttribLocation(program, "aVertexColor")
        },
        uniformLocations: {
          projectionMatrix: gl.getUniformLocation(program, "uProjMatrix"),
          viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
          worldMatrix: gl.getUniformLocation(program, "uWorldMatrix")
        }
      };
    }
    function createTextureProgram() {
      const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;

            uniform mat4 uWorldMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjMatrix;

            varying lowp vec2 vTextureCoord;

            void main(void) {
                gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition; // Original, no z-translating
                vTextureCoord = aTextureCoord;
            }
        `;
      const fsSource = `
            varying lowp vec2 vTextureCoord;

            uniform sampler2D uSampler;

            void main(void) {
                gl_FragColor = texture2D(uSampler, vTextureCoord);
            }
        `;
      const program = createShaderProgram(vsSource, fsSource);
      return {
        program,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
          textureCoord: gl.getAttribLocation(program, "aTextureCoord")
        },
        uniformLocations: {
          projectionMatrix: gl.getUniformLocation(program, "uProjMatrix"),
          viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
          worldMatrix: gl.getUniformLocation(program, "uWorldMatrix"),
          uSampler: gl.getUniformLocation(program, "uSampler")
        }
      };
    }
    function createColoredTextureProgram() {
      const vsSource = `
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;
            attribute vec4 aVertexColor;

            uniform mat4 uWorldMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjMatrix;

            varying lowp vec2 vTextureCoord;
            varying lowp vec4 vColor;

            void main(void) {
                gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
                vTextureCoord = aTextureCoord;
                vColor = aVertexColor;
            }
        `;
      const fsSource = `
            varying lowp vec2 vTextureCoord;
            varying lowp vec4 vColor;

            uniform sampler2D uSampler;

            void main(void) {
                gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;
            }
        `;
      const program = createShaderProgram(vsSource, fsSource);
      return {
        program,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
          textureCoord: gl.getAttribLocation(program, "aTextureCoord"),
          vertexColor: gl.getAttribLocation(program, "aVertexColor")
        },
        uniformLocations: {
          projectionMatrix: gl.getUniformLocation(program, "uProjMatrix"),
          viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
          worldMatrix: gl.getUniformLocation(program, "uWorldMatrix"),
          uSampler: gl.getUniformLocation(program, "uSampler")
        }
      };
    }
    function createTintedTextureProgram() {
      const vsSource = `  
            attribute vec4 aVertexPosition;
            attribute vec2 aTextureCoord;

            uniform mat4 uWorldMatrix;
            uniform mat4 uViewMatrix;
            uniform mat4 uProjMatrix;

            varying lowp vec2 vTextureCoord;

            void main(void) {
                gl_Position = uProjMatrix * uViewMatrix * uWorldMatrix * aVertexPosition;
                vTextureCoord = aTextureCoord;
            }
        `;
      const fsSource = `
            varying lowp vec2 vTextureCoord;

            uniform lowp vec4 uVertexColor;
            uniform sampler2D uSampler;

            void main(void) {
                gl_FragColor = texture2D(uSampler, vTextureCoord) * uVertexColor;
            }
        `;
      const program = createShaderProgram(vsSource, fsSource);
      const tintedTextureProgram = {
        program,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(program, "aVertexPosition"),
          textureCoord: gl.getAttribLocation(program, "aTextureCoord")
        },
        uniformLocations: {
          uVertexColor: gl.getUniformLocation(program, "uVertexColor"),
          projectionMatrix: gl.getUniformLocation(program, "uProjMatrix"),
          viewMatrix: gl.getUniformLocation(program, "uViewMatrix"),
          worldMatrix: gl.getUniformLocation(program, "uWorldMatrix"),
          uSampler: gl.getUniformLocation(program, "uSampler")
        }
      };
      gl.useProgram(tintedTextureProgram.program);
      const defaultColor = [1, 1, 1, 1];
      gl.uniform4fv(tintedTextureProgram.uniformLocations.uVertexColor, defaultColor);
      return tintedTextureProgram;
    }
    function createShaderProgram(vsSourceText, fsSourceText) {
      const vertexShader = createShader(gl.VERTEX_SHADER, vsSourceText);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSourceText);
      const shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(`${translations["shaders_failed"]} ${gl.getProgramInfoLog(shaderProgram)}`);
        return null;
      }
      return shaderProgram;
    }
    function createShader(type, sourceText) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, sourceText);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = `${translations["failed_compiling_shaders"]} ${gl.getShaderInfoLog(shader)}`;
        alert(error);
        console.error(error);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    return Object.freeze({
      initPrograms,
      programs
    });
  }();

  // src/client/scripts/game/rendering/gl-matrix.mjs
  var mat4 = function() {
    "use strict";
    var EPSILON = 1e-6;
    var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
    function create$5() {
      var out = new ARRAY_TYPE(16);
      if (ARRAY_TYPE != Float32Array) {
        out[1] = 0;
        out[2] = 0;
        out[3] = 0;
        out[4] = 0;
        out[6] = 0;
        out[7] = 0;
        out[8] = 0;
        out[9] = 0;
        out[11] = 0;
        out[12] = 0;
        out[13] = 0;
        out[14] = 0;
      }
      out[0] = 1;
      out[5] = 1;
      out[10] = 1;
      out[15] = 1;
      return out;
    }
    function clone$5(a) {
      var out = new ARRAY_TYPE(16);
      out[0] = a[0];
      out[1] = a[1];
      out[2] = a[2];
      out[3] = a[3];
      out[4] = a[4];
      out[5] = a[5];
      out[6] = a[6];
      out[7] = a[7];
      out[8] = a[8];
      out[9] = a[9];
      out[10] = a[10];
      out[11] = a[11];
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
      return out;
    }
    function copy$5(out, a) {
      out[0] = a[0];
      out[1] = a[1];
      out[2] = a[2];
      out[3] = a[3];
      out[4] = a[4];
      out[5] = a[5];
      out[6] = a[6];
      out[7] = a[7];
      out[8] = a[8];
      out[9] = a[9];
      out[10] = a[10];
      out[11] = a[11];
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
      return out;
    }
    function fromValues$5(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
      var out = new ARRAY_TYPE(16);
      out[0] = m00;
      out[1] = m01;
      out[2] = m02;
      out[3] = m03;
      out[4] = m10;
      out[5] = m11;
      out[6] = m12;
      out[7] = m13;
      out[8] = m20;
      out[9] = m21;
      out[10] = m22;
      out[11] = m23;
      out[12] = m30;
      out[13] = m31;
      out[14] = m32;
      out[15] = m33;
      return out;
    }
    function set$5(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
      out[0] = m00;
      out[1] = m01;
      out[2] = m02;
      out[3] = m03;
      out[4] = m10;
      out[5] = m11;
      out[6] = m12;
      out[7] = m13;
      out[8] = m20;
      out[9] = m21;
      out[10] = m22;
      out[11] = m23;
      out[12] = m30;
      out[13] = m31;
      out[14] = m32;
      out[15] = m33;
      return out;
    }
    function identity$2(out) {
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = 1;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 1;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function transpose(out, a) {
      if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3];
        var a12 = a[6], a13 = a[7];
        var a23 = a[11];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
      } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
      }
      return out;
    }
    function invert$2(out, a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b00 = a00 * a11 - a01 * a10;
      var b01 = a00 * a12 - a02 * a10;
      var b02 = a00 * a13 - a03 * a10;
      var b03 = a01 * a12 - a02 * a11;
      var b04 = a01 * a13 - a03 * a11;
      var b05 = a02 * a13 - a03 * a12;
      var b06 = a20 * a31 - a21 * a30;
      var b07 = a20 * a32 - a22 * a30;
      var b08 = a20 * a33 - a23 * a30;
      var b09 = a21 * a32 - a22 * a31;
      var b10 = a21 * a33 - a23 * a31;
      var b11 = a22 * a33 - a23 * a32;
      var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) {
        return null;
      }
      det = 1 / det;
      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
    }
    function adjoint(out, a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b00 = a00 * a11 - a01 * a10;
      var b01 = a00 * a12 - a02 * a10;
      var b02 = a00 * a13 - a03 * a10;
      var b03 = a01 * a12 - a02 * a11;
      var b04 = a01 * a13 - a03 * a11;
      var b05 = a02 * a13 - a03 * a12;
      var b06 = a20 * a31 - a21 * a30;
      var b07 = a20 * a32 - a22 * a30;
      var b08 = a20 * a33 - a23 * a30;
      var b09 = a21 * a32 - a22 * a31;
      var b10 = a21 * a33 - a23 * a31;
      var b11 = a22 * a33 - a23 * a32;
      out[0] = a11 * b11 - a12 * b10 + a13 * b09;
      out[1] = a02 * b10 - a01 * b11 - a03 * b09;
      out[2] = a31 * b05 - a32 * b04 + a33 * b03;
      out[3] = a22 * b04 - a21 * b05 - a23 * b03;
      out[4] = a12 * b08 - a10 * b11 - a13 * b07;
      out[5] = a00 * b11 - a02 * b08 + a03 * b07;
      out[6] = a32 * b02 - a30 * b05 - a33 * b01;
      out[7] = a20 * b05 - a22 * b02 + a23 * b01;
      out[8] = a10 * b10 - a11 * b08 + a13 * b06;
      out[9] = a01 * b08 - a00 * b10 - a03 * b06;
      out[10] = a30 * b04 - a31 * b02 + a33 * b00;
      out[11] = a21 * b02 - a20 * b04 - a23 * b00;
      out[12] = a11 * b07 - a10 * b09 - a12 * b06;
      out[13] = a00 * b09 - a01 * b07 + a02 * b06;
      out[14] = a31 * b01 - a30 * b03 - a32 * b00;
      out[15] = a20 * b03 - a21 * b01 + a22 * b00;
      return out;
    }
    function determinant(a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b0 = a00 * a11 - a01 * a10;
      var b1 = a00 * a12 - a02 * a10;
      var b2 = a01 * a12 - a02 * a11;
      var b3 = a20 * a31 - a21 * a30;
      var b4 = a20 * a32 - a22 * a30;
      var b5 = a21 * a32 - a22 * a31;
      var b6 = a00 * b5 - a01 * b4 + a02 * b3;
      var b7 = a10 * b5 - a11 * b4 + a12 * b3;
      var b8 = a20 * b2 - a21 * b1 + a22 * b0;
      var b9 = a30 * b2 - a31 * b1 + a32 * b0;
      return a13 * b6 - a03 * b7 + a33 * b8 - a23 * b9;
    }
    function multiply$5(out, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4];
      b1 = b[5];
      b2 = b[6];
      b3 = b[7];
      out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8];
      b1 = b[9];
      b2 = b[10];
      b3 = b[11];
      out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12];
      b1 = b[13];
      b2 = b[14];
      b3 = b[15];
      out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return out;
    }
    function translate$1(out, a, v) {
      var x = v[0], y = v[1], z = v[2];
      var a00, a01, a02, a03;
      var a10, a11, a12, a13;
      var a20, a21, a22, a23;
      if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
      } else {
        a00 = a[0];
        a01 = a[1];
        a02 = a[2];
        a03 = a[3];
        a10 = a[4];
        a11 = a[5];
        a12 = a[6];
        a13 = a[7];
        a20 = a[8];
        a21 = a[9];
        a22 = a[10];
        a23 = a[11];
        out[0] = a00;
        out[1] = a01;
        out[2] = a02;
        out[3] = a03;
        out[4] = a10;
        out[5] = a11;
        out[6] = a12;
        out[7] = a13;
        out[8] = a20;
        out[9] = a21;
        out[10] = a22;
        out[11] = a23;
        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
      }
      return out;
    }
    function scale$5(out, a, v) {
      var x = v[0], y = v[1], z = v[2];
      out[0] = a[0] * x;
      out[1] = a[1] * x;
      out[2] = a[2] * x;
      out[3] = a[3] * x;
      out[4] = a[4] * y;
      out[5] = a[5] * y;
      out[6] = a[6] * y;
      out[7] = a[7] * y;
      out[8] = a[8] * z;
      out[9] = a[9] * z;
      out[10] = a[10] * z;
      out[11] = a[11] * z;
      out[12] = a[12];
      out[13] = a[13];
      out[14] = a[14];
      out[15] = a[15];
      return out;
    }
    function rotate$1(out, a, rad, axis) {
      var x = axis[0], y = axis[1], z = axis[2];
      var len = Math.hypot(x, y, z);
      var s, c, t;
      var a00, a01, a02, a03;
      var a10, a11, a12, a13;
      var a20, a21, a22, a23;
      var b00, b01, b02;
      var b10, b11, b12;
      var b20, b21, b22;
      if (len < EPSILON) {
        return null;
      }
      len = 1 / len;
      x *= len;
      y *= len;
      z *= len;
      s = Math.sin(rad);
      c = Math.cos(rad);
      t = 1 - c;
      a00 = a[0];
      a01 = a[1];
      a02 = a[2];
      a03 = a[3];
      a10 = a[4];
      a11 = a[5];
      a12 = a[6];
      a13 = a[7];
      a20 = a[8];
      a21 = a[9];
      a22 = a[10];
      a23 = a[11];
      b00 = x * x * t + c;
      b01 = y * x * t + z * s;
      b02 = z * x * t - y * s;
      b10 = x * y * t - z * s;
      b11 = y * y * t + c;
      b12 = z * y * t + x * s;
      b20 = x * z * t + y * s;
      b21 = y * z * t - x * s;
      b22 = z * z * t + c;
      out[0] = a00 * b00 + a10 * b01 + a20 * b02;
      out[1] = a01 * b00 + a11 * b01 + a21 * b02;
      out[2] = a02 * b00 + a12 * b01 + a22 * b02;
      out[3] = a03 * b00 + a13 * b01 + a23 * b02;
      out[4] = a00 * b10 + a10 * b11 + a20 * b12;
      out[5] = a01 * b10 + a11 * b11 + a21 * b12;
      out[6] = a02 * b10 + a12 * b11 + a22 * b12;
      out[7] = a03 * b10 + a13 * b11 + a23 * b12;
      out[8] = a00 * b20 + a10 * b21 + a20 * b22;
      out[9] = a01 * b20 + a11 * b21 + a21 * b22;
      out[10] = a02 * b20 + a12 * b21 + a22 * b22;
      out[11] = a03 * b20 + a13 * b21 + a23 * b22;
      if (a !== out) {
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
      }
      return out;
    }
    function rotateX$3(out, a, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      var a10 = a[4];
      var a11 = a[5];
      var a12 = a[6];
      var a13 = a[7];
      var a20 = a[8];
      var a21 = a[9];
      var a22 = a[10];
      var a23 = a[11];
      if (a !== out) {
        out[0] = a[0];
        out[1] = a[1];
        out[2] = a[2];
        out[3] = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
      }
      out[4] = a10 * c + a20 * s;
      out[5] = a11 * c + a21 * s;
      out[6] = a12 * c + a22 * s;
      out[7] = a13 * c + a23 * s;
      out[8] = a20 * c - a10 * s;
      out[9] = a21 * c - a11 * s;
      out[10] = a22 * c - a12 * s;
      out[11] = a23 * c - a13 * s;
      return out;
    }
    function rotateY$3(out, a, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      var a00 = a[0];
      var a01 = a[1];
      var a02 = a[2];
      var a03 = a[3];
      var a20 = a[8];
      var a21 = a[9];
      var a22 = a[10];
      var a23 = a[11];
      if (a !== out) {
        out[4] = a[4];
        out[5] = a[5];
        out[6] = a[6];
        out[7] = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
      }
      out[0] = a00 * c - a20 * s;
      out[1] = a01 * c - a21 * s;
      out[2] = a02 * c - a22 * s;
      out[3] = a03 * c - a23 * s;
      out[8] = a00 * s + a20 * c;
      out[9] = a01 * s + a21 * c;
      out[10] = a02 * s + a22 * c;
      out[11] = a03 * s + a23 * c;
      return out;
    }
    function rotateZ$3(out, a, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      var a00 = a[0];
      var a01 = a[1];
      var a02 = a[2];
      var a03 = a[3];
      var a10 = a[4];
      var a11 = a[5];
      var a12 = a[6];
      var a13 = a[7];
      if (a !== out) {
        out[8] = a[8];
        out[9] = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
      }
      out[0] = a00 * c + a10 * s;
      out[1] = a01 * c + a11 * s;
      out[2] = a02 * c + a12 * s;
      out[3] = a03 * c + a13 * s;
      out[4] = a10 * c - a00 * s;
      out[5] = a11 * c - a01 * s;
      out[6] = a12 * c - a02 * s;
      out[7] = a13 * c - a03 * s;
      return out;
    }
    function fromTranslation$1(out, v) {
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = 1;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 1;
      out[11] = 0;
      out[12] = v[0];
      out[13] = v[1];
      out[14] = v[2];
      out[15] = 1;
      return out;
    }
    function fromScaling(out, v) {
      out[0] = v[0];
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = v[1];
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = v[2];
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function fromRotation$1(out, rad, axis) {
      var x = axis[0], y = axis[1], z = axis[2];
      var len = Math.hypot(x, y, z);
      var s, c, t;
      if (len < EPSILON) {
        return null;
      }
      len = 1 / len;
      x *= len;
      y *= len;
      z *= len;
      s = Math.sin(rad);
      c = Math.cos(rad);
      t = 1 - c;
      out[0] = x * x * t + c;
      out[1] = y * x * t + z * s;
      out[2] = z * x * t - y * s;
      out[3] = 0;
      out[4] = x * y * t - z * s;
      out[5] = y * y * t + c;
      out[6] = z * y * t + x * s;
      out[7] = 0;
      out[8] = x * z * t + y * s;
      out[9] = y * z * t - x * s;
      out[10] = z * z * t + c;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function fromXRotation(out, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      out[0] = 1;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = c;
      out[6] = s;
      out[7] = 0;
      out[8] = 0;
      out[9] = -s;
      out[10] = c;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function fromYRotation(out, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      out[0] = c;
      out[1] = 0;
      out[2] = -s;
      out[3] = 0;
      out[4] = 0;
      out[5] = 1;
      out[6] = 0;
      out[7] = 0;
      out[8] = s;
      out[9] = 0;
      out[10] = c;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function fromZRotation(out, rad) {
      var s = Math.sin(rad);
      var c = Math.cos(rad);
      out[0] = c;
      out[1] = s;
      out[2] = 0;
      out[3] = 0;
      out[4] = -s;
      out[5] = c;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 1;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function fromRotationTranslation$1(out, q, v) {
      var x = q[0], y = q[1], z = q[2], w = q[3];
      var x2 = x + x;
      var y2 = y + y;
      var z2 = z + z;
      var xx = x * x2;
      var xy = x * y2;
      var xz = x * z2;
      var yy = y * y2;
      var yz = y * z2;
      var zz = z * z2;
      var wx = w * x2;
      var wy = w * y2;
      var wz = w * z2;
      out[0] = 1 - (yy + zz);
      out[1] = xy + wz;
      out[2] = xz - wy;
      out[3] = 0;
      out[4] = xy - wz;
      out[5] = 1 - (xx + zz);
      out[6] = yz + wx;
      out[7] = 0;
      out[8] = xz + wy;
      out[9] = yz - wx;
      out[10] = 1 - (xx + yy);
      out[11] = 0;
      out[12] = v[0];
      out[13] = v[1];
      out[14] = v[2];
      out[15] = 1;
      return out;
    }
    function fromQuat2(out, a) {
      var translation = new ARRAY_TYPE(3);
      var bx = -a[0], by = -a[1], bz = -a[2], bw = a[3], ax = a[4], ay = a[5], az = a[6], aw = a[7];
      var magnitude = bx * bx + by * by + bz * bz + bw * bw;
      if (magnitude > 0) {
        translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2 / magnitude;
        translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2 / magnitude;
        translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2 / magnitude;
      } else {
        translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2;
        translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2;
        translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2;
      }
      fromRotationTranslation$1(out, a, translation);
      return out;
    }
    function getTranslation$1(out, mat) {
      out[0] = mat[12];
      out[1] = mat[13];
      out[2] = mat[14];
      return out;
    }
    function getScaling(out, mat) {
      var m11 = mat[0];
      var m12 = mat[1];
      var m13 = mat[2];
      var m21 = mat[4];
      var m22 = mat[5];
      var m23 = mat[6];
      var m31 = mat[8];
      var m32 = mat[9];
      var m33 = mat[10];
      out[0] = Math.hypot(m11, m12, m13);
      out[1] = Math.hypot(m21, m22, m23);
      out[2] = Math.hypot(m31, m32, m33);
      return out;
    }
    function getRotation(out, mat) {
      var scaling = new ARRAY_TYPE(3);
      getScaling(scaling, mat);
      var is1 = 1 / scaling[0];
      var is2 = 1 / scaling[1];
      var is3 = 1 / scaling[2];
      var sm11 = mat[0] * is1;
      var sm12 = mat[1] * is2;
      var sm13 = mat[2] * is3;
      var sm21 = mat[4] * is1;
      var sm22 = mat[5] * is2;
      var sm23 = mat[6] * is3;
      var sm31 = mat[8] * is1;
      var sm32 = mat[9] * is2;
      var sm33 = mat[10] * is3;
      var trace = sm11 + sm22 + sm33;
      var S = 0;
      if (trace > 0) {
        S = Math.sqrt(trace + 1) * 2;
        out[3] = 0.25 * S;
        out[0] = (sm23 - sm32) / S;
        out[1] = (sm31 - sm13) / S;
        out[2] = (sm12 - sm21) / S;
      } else if (sm11 > sm22 && sm11 > sm33) {
        S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
        out[3] = (sm23 - sm32) / S;
        out[0] = 0.25 * S;
        out[1] = (sm12 + sm21) / S;
        out[2] = (sm31 + sm13) / S;
      } else if (sm22 > sm33) {
        S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
        out[3] = (sm31 - sm13) / S;
        out[0] = (sm12 + sm21) / S;
        out[1] = 0.25 * S;
        out[2] = (sm23 + sm32) / S;
      } else {
        S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
        out[3] = (sm12 - sm21) / S;
        out[0] = (sm31 + sm13) / S;
        out[1] = (sm23 + sm32) / S;
        out[2] = 0.25 * S;
      }
      return out;
    }
    function decompose(out_r, out_t, out_s, mat) {
      out_t[0] = mat[12];
      out_t[1] = mat[13];
      out_t[2] = mat[14];
      var m11 = mat[0];
      var m12 = mat[1];
      var m13 = mat[2];
      var m21 = mat[4];
      var m22 = mat[5];
      var m23 = mat[6];
      var m31 = mat[8];
      var m32 = mat[9];
      var m33 = mat[10];
      out_s[0] = Math.hypot(m11, m12, m13);
      out_s[1] = Math.hypot(m21, m22, m23);
      out_s[2] = Math.hypot(m31, m32, m33);
      var is1 = 1 / out_s[0];
      var is2 = 1 / out_s[1];
      var is3 = 1 / out_s[2];
      var sm11 = m11 * is1;
      var sm12 = m12 * is2;
      var sm13 = m13 * is3;
      var sm21 = m21 * is1;
      var sm22 = m22 * is2;
      var sm23 = m23 * is3;
      var sm31 = m31 * is1;
      var sm32 = m32 * is2;
      var sm33 = m33 * is3;
      var trace = sm11 + sm22 + sm33;
      var S = 0;
      if (trace > 0) {
        S = Math.sqrt(trace + 1) * 2;
        out_r[3] = 0.25 * S;
        out_r[0] = (sm23 - sm32) / S;
        out_r[1] = (sm31 - sm13) / S;
        out_r[2] = (sm12 - sm21) / S;
      } else if (sm11 > sm22 && sm11 > sm33) {
        S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
        out_r[3] = (sm23 - sm32) / S;
        out_r[0] = 0.25 * S;
        out_r[1] = (sm12 + sm21) / S;
        out_r[2] = (sm31 + sm13) / S;
      } else if (sm22 > sm33) {
        S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
        out_r[3] = (sm31 - sm13) / S;
        out_r[0] = (sm12 + sm21) / S;
        out_r[1] = 0.25 * S;
        out_r[2] = (sm23 + sm32) / S;
      } else {
        S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
        out_r[3] = (sm12 - sm21) / S;
        out_r[0] = (sm31 + sm13) / S;
        out_r[1] = (sm23 + sm32) / S;
        out_r[2] = 0.25 * S;
      }
      return out_r;
    }
    function fromRotationTranslationScale(out, q, v, s) {
      var x = q[0], y = q[1], z = q[2], w = q[3];
      var x2 = x + x;
      var y2 = y + y;
      var z2 = z + z;
      var xx = x * x2;
      var xy = x * y2;
      var xz = x * z2;
      var yy = y * y2;
      var yz = y * z2;
      var zz = z * z2;
      var wx = w * x2;
      var wy = w * y2;
      var wz = w * z2;
      var sx = s[0];
      var sy = s[1];
      var sz = s[2];
      out[0] = (1 - (yy + zz)) * sx;
      out[1] = (xy + wz) * sx;
      out[2] = (xz - wy) * sx;
      out[3] = 0;
      out[4] = (xy - wz) * sy;
      out[5] = (1 - (xx + zz)) * sy;
      out[6] = (yz + wx) * sy;
      out[7] = 0;
      out[8] = (xz + wy) * sz;
      out[9] = (yz - wx) * sz;
      out[10] = (1 - (xx + yy)) * sz;
      out[11] = 0;
      out[12] = v[0];
      out[13] = v[1];
      out[14] = v[2];
      out[15] = 1;
      return out;
    }
    function fromRotationTranslationScaleOrigin(out, q, v, s, o) {
      var x = q[0], y = q[1], z = q[2], w = q[3];
      var x2 = x + x;
      var y2 = y + y;
      var z2 = z + z;
      var xx = x * x2;
      var xy = x * y2;
      var xz = x * z2;
      var yy = y * y2;
      var yz = y * z2;
      var zz = z * z2;
      var wx = w * x2;
      var wy = w * y2;
      var wz = w * z2;
      var sx = s[0];
      var sy = s[1];
      var sz = s[2];
      var ox = o[0];
      var oy = o[1];
      var oz = o[2];
      var out0 = (1 - (yy + zz)) * sx;
      var out1 = (xy + wz) * sx;
      var out2 = (xz - wy) * sx;
      var out4 = (xy - wz) * sy;
      var out5 = (1 - (xx + zz)) * sy;
      var out6 = (yz + wx) * sy;
      var out8 = (xz + wy) * sz;
      var out9 = (yz - wx) * sz;
      var out10 = (1 - (xx + yy)) * sz;
      out[0] = out0;
      out[1] = out1;
      out[2] = out2;
      out[3] = 0;
      out[4] = out4;
      out[5] = out5;
      out[6] = out6;
      out[7] = 0;
      out[8] = out8;
      out[9] = out9;
      out[10] = out10;
      out[11] = 0;
      out[12] = v[0] + ox - (out0 * ox + out4 * oy + out8 * oz);
      out[13] = v[1] + oy - (out1 * ox + out5 * oy + out9 * oz);
      out[14] = v[2] + oz - (out2 * ox + out6 * oy + out10 * oz);
      out[15] = 1;
      return out;
    }
    function fromQuat(out, q) {
      var x = q[0], y = q[1], z = q[2], w = q[3];
      var x2 = x + x;
      var y2 = y + y;
      var z2 = z + z;
      var xx = x * x2;
      var yx = y * x2;
      var yy = y * y2;
      var zx = z * x2;
      var zy = z * y2;
      var zz = z * z2;
      var wx = w * x2;
      var wy = w * y2;
      var wz = w * z2;
      out[0] = 1 - yy - zz;
      out[1] = yx + wz;
      out[2] = zx - wy;
      out[3] = 0;
      out[4] = yx - wz;
      out[5] = 1 - xx - zz;
      out[6] = zy + wx;
      out[7] = 0;
      out[8] = zx + wy;
      out[9] = zy - wx;
      out[10] = 1 - xx - yy;
      out[11] = 0;
      out[12] = 0;
      out[13] = 0;
      out[14] = 0;
      out[15] = 1;
      return out;
    }
    function frustum(out, left, right, bottom, top, near, far) {
      var rl = 1 / (right - left);
      var tb = 1 / (top - bottom);
      var nf = 1 / (near - far);
      out[0] = near * 2 * rl;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = near * 2 * tb;
      out[6] = 0;
      out[7] = 0;
      out[8] = (right + left) * rl;
      out[9] = (top + bottom) * tb;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[12] = 0;
      out[13] = 0;
      out[14] = far * near * 2 * nf;
      out[15] = 0;
      return out;
    }
    function perspectiveNO(out, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2);
      out[0] = f / aspect;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = f;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[11] = -1;
      out[12] = 0;
      out[13] = 0;
      out[15] = 0;
      if (far != null && far !== Infinity) {
        var nf = 1 / (near - far);
        out[10] = (far + near) * nf;
        out[14] = 2 * far * near * nf;
      } else {
        out[10] = -1;
        out[14] = -2 * near;
      }
      return out;
    }
    var perspective3 = perspectiveNO;
    function perspectiveZO(out, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2);
      out[0] = f / aspect;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = f;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[11] = -1;
      out[12] = 0;
      out[13] = 0;
      out[15] = 0;
      if (far != null && far !== Infinity) {
        var nf = 1 / (near - far);
        out[10] = far * nf;
        out[14] = far * near * nf;
      } else {
        out[10] = -1;
        out[14] = -near;
      }
      return out;
    }
    function perspectiveFromFieldOfView(out, fov, near, far) {
      var upTan = Math.tan(fov.upDegrees * Math.PI / 180);
      var downTan = Math.tan(fov.downDegrees * Math.PI / 180);
      var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180);
      var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180);
      var xScale = 2 / (leftTan + rightTan);
      var yScale = 2 / (upTan + downTan);
      out[0] = xScale;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = yScale;
      out[6] = 0;
      out[7] = 0;
      out[8] = -((leftTan - rightTan) * xScale * 0.5);
      out[9] = (upTan - downTan) * yScale * 0.5;
      out[10] = far / (near - far);
      out[11] = -1;
      out[12] = 0;
      out[13] = 0;
      out[14] = far * near / (near - far);
      out[15] = 0;
      return out;
    }
    function orthoNO(out, left, right, bottom, top, near, far) {
      var lr = 1 / (left - right);
      var bt = 1 / (bottom - top);
      var nf = 1 / (near - far);
      out[0] = -2 * lr;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = -2 * bt;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = 2 * nf;
      out[11] = 0;
      out[12] = (left + right) * lr;
      out[13] = (top + bottom) * bt;
      out[14] = (far + near) * nf;
      out[15] = 1;
      return out;
    }
    var ortho = orthoNO;
    function orthoZO(out, left, right, bottom, top, near, far) {
      var lr = 1 / (left - right);
      var bt = 1 / (bottom - top);
      var nf = 1 / (near - far);
      out[0] = -2 * lr;
      out[1] = 0;
      out[2] = 0;
      out[3] = 0;
      out[4] = 0;
      out[5] = -2 * bt;
      out[6] = 0;
      out[7] = 0;
      out[8] = 0;
      out[9] = 0;
      out[10] = nf;
      out[11] = 0;
      out[12] = (left + right) * lr;
      out[13] = (top + bottom) * bt;
      out[14] = near * nf;
      out[15] = 1;
      return out;
    }
    function lookAt(out, eye, center, up) {
      var x0, x1, x2, y0, y1, y2, z0, z1, z2, len;
      var eyex = eye[0];
      var eyey = eye[1];
      var eyez = eye[2];
      var upx = up[0];
      var upy = up[1];
      var upz = up[2];
      var centerx = center[0];
      var centery = center[1];
      var centerz = center[2];
      if (Math.abs(eyex - centerx) < EPSILON && Math.abs(eyey - centery) < EPSILON && Math.abs(eyez - centerz) < EPSILON) {
        return identity$2(out);
      }
      z0 = eyex - centerx;
      z1 = eyey - centery;
      z2 = eyez - centerz;
      len = 1 / Math.hypot(z0, z1, z2);
      z0 *= len;
      z1 *= len;
      z2 *= len;
      x0 = upy * z2 - upz * z1;
      x1 = upz * z0 - upx * z2;
      x2 = upx * z1 - upy * z0;
      len = Math.hypot(x0, x1, x2);
      if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
      } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
      }
      y0 = z1 * x2 - z2 * x1;
      y1 = z2 * x0 - z0 * x2;
      y2 = z0 * x1 - z1 * x0;
      len = Math.hypot(y0, y1, y2);
      if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
      } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
      }
      out[0] = x0;
      out[1] = y0;
      out[2] = z0;
      out[3] = 0;
      out[4] = x1;
      out[5] = y1;
      out[6] = z1;
      out[7] = 0;
      out[8] = x2;
      out[9] = y2;
      out[10] = z2;
      out[11] = 0;
      out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
      out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
      out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
      out[15] = 1;
      return out;
    }
    function targetTo(out, eye, target, up) {
      var eyex = eye[0], eyey = eye[1], eyez = eye[2], upx = up[0], upy = up[1], upz = up[2];
      var z0 = eyex - target[0], z1 = eyey - target[1], z2 = eyez - target[2];
      var len = z0 * z0 + z1 * z1 + z2 * z2;
      if (len > 0) {
        len = 1 / Math.sqrt(len);
        z0 *= len;
        z1 *= len;
        z2 *= len;
      }
      var x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
      len = x0 * x0 + x1 * x1 + x2 * x2;
      if (len > 0) {
        len = 1 / Math.sqrt(len);
        x0 *= len;
        x1 *= len;
        x2 *= len;
      }
      out[0] = x0;
      out[1] = x1;
      out[2] = x2;
      out[3] = 0;
      out[4] = z1 * x2 - z2 * x1;
      out[5] = z2 * x0 - z0 * x2;
      out[6] = z0 * x1 - z1 * x0;
      out[7] = 0;
      out[8] = z0;
      out[9] = z1;
      out[10] = z2;
      out[11] = 0;
      out[12] = eyex;
      out[13] = eyey;
      out[14] = eyez;
      out[15] = 1;
      return out;
    }
    function str$5(a) {
      return "mat4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ", " + a[9] + ", " + a[10] + ", " + a[11] + ", " + a[12] + ", " + a[13] + ", " + a[14] + ", " + a[15] + ")";
    }
    function frob(a) {
      return Math.hypot(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15]);
    }
    function add$5(out, a, b) {
      out[0] = a[0] + b[0];
      out[1] = a[1] + b[1];
      out[2] = a[2] + b[2];
      out[3] = a[3] + b[3];
      out[4] = a[4] + b[4];
      out[5] = a[5] + b[5];
      out[6] = a[6] + b[6];
      out[7] = a[7] + b[7];
      out[8] = a[8] + b[8];
      out[9] = a[9] + b[9];
      out[10] = a[10] + b[10];
      out[11] = a[11] + b[11];
      out[12] = a[12] + b[12];
      out[13] = a[13] + b[13];
      out[14] = a[14] + b[14];
      out[15] = a[15] + b[15];
      return out;
    }
    function subtract$3(out, a, b) {
      out[0] = a[0] - b[0];
      out[1] = a[1] - b[1];
      out[2] = a[2] - b[2];
      out[3] = a[3] - b[3];
      out[4] = a[4] - b[4];
      out[5] = a[5] - b[5];
      out[6] = a[6] - b[6];
      out[7] = a[7] - b[7];
      out[8] = a[8] - b[8];
      out[9] = a[9] - b[9];
      out[10] = a[10] - b[10];
      out[11] = a[11] - b[11];
      out[12] = a[12] - b[12];
      out[13] = a[13] - b[13];
      out[14] = a[14] - b[14];
      out[15] = a[15] - b[15];
      return out;
    }
    function multiplyScalar(out, a, b) {
      out[0] = a[0] * b;
      out[1] = a[1] * b;
      out[2] = a[2] * b;
      out[3] = a[3] * b;
      out[4] = a[4] * b;
      out[5] = a[5] * b;
      out[6] = a[6] * b;
      out[7] = a[7] * b;
      out[8] = a[8] * b;
      out[9] = a[9] * b;
      out[10] = a[10] * b;
      out[11] = a[11] * b;
      out[12] = a[12] * b;
      out[13] = a[13] * b;
      out[14] = a[14] * b;
      out[15] = a[15] * b;
      return out;
    }
    function multiplyScalarAndAdd(out, a, b, scale) {
      out[0] = a[0] + b[0] * scale;
      out[1] = a[1] + b[1] * scale;
      out[2] = a[2] + b[2] * scale;
      out[3] = a[3] + b[3] * scale;
      out[4] = a[4] + b[4] * scale;
      out[5] = a[5] + b[5] * scale;
      out[6] = a[6] + b[6] * scale;
      out[7] = a[7] + b[7] * scale;
      out[8] = a[8] + b[8] * scale;
      out[9] = a[9] + b[9] * scale;
      out[10] = a[10] + b[10] * scale;
      out[11] = a[11] + b[11] * scale;
      out[12] = a[12] + b[12] * scale;
      out[13] = a[13] + b[13] * scale;
      out[14] = a[14] + b[14] * scale;
      out[15] = a[15] + b[15] * scale;
      return out;
    }
    function exactEquals$5(a, b) {
      return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
    }
    function equals$5(a, b) {
      var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
      var a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
      var a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11];
      var a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
      var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      var b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
      var b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11];
      var b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
      return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8)) && Math.abs(a9 - b9) <= EPSILON * Math.max(1, Math.abs(a9), Math.abs(b9)) && Math.abs(a10 - b10) <= EPSILON * Math.max(1, Math.abs(a10), Math.abs(b10)) && Math.abs(a11 - b11) <= EPSILON * Math.max(1, Math.abs(a11), Math.abs(b11)) && Math.abs(a12 - b12) <= EPSILON * Math.max(1, Math.abs(a12), Math.abs(b12)) && Math.abs(a13 - b13) <= EPSILON * Math.max(1, Math.abs(a13), Math.abs(b13)) && Math.abs(a14 - b14) <= EPSILON * Math.max(1, Math.abs(a14), Math.abs(b14)) && Math.abs(a15 - b15) <= EPSILON * Math.max(1, Math.abs(a15), Math.abs(b15));
    }
    var mul$5 = multiply$5;
    var sub$3 = subtract$3;
    return /* @__PURE__ */ Object.freeze({
      __proto__: null,
      create: create$5,
      clone: clone$5,
      copy: copy$5,
      fromValues: fromValues$5,
      set: set$5,
      identity: identity$2,
      transpose,
      invert: invert$2,
      adjoint,
      determinant,
      multiply: multiply$5,
      translate: translate$1,
      scale: scale$5,
      rotate: rotate$1,
      rotateX: rotateX$3,
      rotateY: rotateY$3,
      rotateZ: rotateZ$3,
      fromTranslation: fromTranslation$1,
      fromScaling,
      fromRotation: fromRotation$1,
      fromXRotation,
      fromYRotation,
      fromZRotation,
      fromRotationTranslation: fromRotationTranslation$1,
      fromQuat2,
      getTranslation: getTranslation$1,
      getScaling,
      getRotation,
      decompose,
      fromRotationTranslationScale,
      fromRotationTranslationScaleOrigin,
      fromQuat,
      frustum,
      perspectiveNO,
      perspective: perspective3,
      perspectiveZO,
      perspectiveFromFieldOfView,
      orthoNO,
      ortho,
      orthoZO,
      lookAt,
      targetTo,
      str: str$5,
      frob,
      add: add$5,
      subtract: subtract$3,
      multiplyScalar,
      multiplyScalarAndAdd,
      exactEquals: exactEquals$5,
      equals: equals$5,
      mul: mul$5,
      sub: sub$3
    });
  }();

  // src/client/scripts/game/rendering/buffermodel.mjs
  var buffermodel = function() {
    const validRenderModes = ["TRIANGLES", "TRIANGLE_STRIP", "TRIANGLE_FAN", "POINTS", "LINE_LOOP", "LINE_STRIP", "LINES"];
    const DRAW_HINT = "STATIC_DRAW";
    function createModel_Colored(data, numPositionComponents, mode) {
      if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`);
      const stride = numPositionComponents + 4;
      const prepDrawFunc = getPrepDrawFunc(shaders.programs.colorProgram, numPositionComponents, false, true);
      return new BufferModel(shaders.programs.colorProgram, data, stride, mode, void 0, prepDrawFunc);
    }
    function createModel_Textured(data, numPositionComponents, mode, texture2) {
      if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`);
      if (texture2 == null) return console.error("Cannot create a textured buffer model without a texture!");
      const stride = numPositionComponents + 2;
      const prepDrawFunc = getPrepDrawFunc(shaders.programs.textureProgram, numPositionComponents, true, false);
      return new BufferModel(shaders.programs.textureProgram, data, stride, mode, texture2, prepDrawFunc);
    }
    function createModel_ColorTextured(data, numPositionComponents, mode, texture2) {
      if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`);
      if (texture2 == null) return console.error("Cannot create a textured buffer model without a texture!");
      const stride = numPositionComponents + 6;
      const prepDrawFunc = getPrepDrawFunc(shaders.programs.coloredTextureProgram, numPositionComponents, true, true);
      return new BufferModel(shaders.programs.coloredTextureProgram, data, stride, mode, texture2, prepDrawFunc);
    }
    function createModel_TintTextured(data, numPositionComponents, mode, texture2) {
      if (numPositionComponents < 2 || numPositionComponents > 3) return console.error(`Unsupported numPositionComponents ${numPositionComponents}`);
      if (texture2 == null) return console.error("Cannot create a tinted textured buffer model without a texture!");
      const stride = numPositionComponents + 2;
      const prepDrawFunc = getPrepDrawFunc(shaders.programs.tintedTextureProgram, numPositionComponents, true, false);
      return new BufferModel(shaders.programs.tintedTextureProgram, data, stride, mode, texture2, prepDrawFunc);
    }
    function getPrepDrawFunc(shaderProgram, numPositionComponents, usingTextureCoords, usingColorValues) {
      return function(buffer, stride, BYTES_PER_ELEMENT) {
        gl.useProgram(shaderProgram.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const stride_bytes = stride * BYTES_PER_ELEMENT;
        let current_offset_bytes = 0;
        initAttribute(shaderProgram.attribLocations.vertexPosition, stride_bytes, numPositionComponents, current_offset_bytes);
        current_offset_bytes += numPositionComponents * BYTES_PER_ELEMENT;
        if (usingTextureCoords) {
          const numComponents = 2;
          initAttribute(shaderProgram.attribLocations.textureCoord, stride_bytes, numComponents, current_offset_bytes);
          current_offset_bytes += numComponents * BYTES_PER_ELEMENT;
        }
        if (usingColorValues) {
          const numComponents = 4;
          initAttribute(shaderProgram.attribLocations.vertexColor, stride_bytes, numComponents, current_offset_bytes);
          current_offset_bytes += numComponents * BYTES_PER_ELEMENT;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
      };
    }
    function initAttribute(attribLocation, stride_bytes, numComponents, offset) {
      const type = gl.FLOAT;
      const normalize = false;
      gl.vertexAttribPointer(attribLocation, numComponents, type, normalize, stride_bytes, offset);
      gl.enableVertexAttribArray(attribLocation);
    }
    function renderPreppedModel(program, position = [0, 0, 0], scale = [1, 1, 1], vertexCount, mode, texture2, customUniformValues = {}) {
      const worldMatrix = mat4.create();
      mat4.scale(worldMatrix, worldMatrix, scale);
      mat4.translate(worldMatrix, worldMatrix, position);
      gl.uniformMatrix4fv(program.uniformLocations.worldMatrix, gl.FALSE, worldMatrix);
      for (const key in customUniformValues) {
        sendCustomUniformToGPU(program, key, customUniformValues[key]);
      }
      if (texture2) gl.bindTexture(gl.TEXTURE_2D, texture2);
      const offset = 0;
      gl.drawArrays(gl[mode], offset, vertexCount);
      if (texture2) gl.bindTexture(gl.TEXTURE_2D, null);
    }
    function sendCustomUniformToGPU(program, name, value) {
      const type = getUniformValueType(value);
      const method = getUniformMethodForValue(type, value);
      if (type === "matrix") {
        const transpose = false;
        return gl[method](program.uniformLocations[name], transpose, value);
      }
      gl[method](program.uniformLocations[name], value);
    }
    function getUniformMethodForValue(type, value) {
      switch (type) {
        case "array":
          return getArrayUniformMethod(value);
        case "matrix":
          return getMatrixUniformMethod(value);
        case "number":
          return "uniform1i";
        default:
          console.error(`Unsupported uniform type ${type}.`);
      }
    }
    function getArrayUniformMethod(value) {
      const length = value.length;
      if (length > 4 || length === 0) return console.error(`Unsupported array length ${length} for uniform value.`);
      return `uniform${length}fv`;
    }
    function getMatrixUniformMethod(value) {
      const length = value.length;
      switch (length) {
        case 4:
          return "uniformMatrix2fv";
        case 9:
          return "uniformMatrix3fv";
        case 16:
          return "uniformMatrix4fv";
        default:
          console.error(`Unsupported matrix size ${length} for uniform value.`);
      }
    }
    function getUniformValueType(value) {
      if (Array.isArray(value)) return "array";
      else if (value instanceof Float32Array) return "matrix";
      else if (typeof value === "number") return "number";
      console.error(`Unsupported uniform value type ${typeof value}.`);
    }
    return Object.freeze({
      validRenderModes,
      DRAW_HINT,
      createModel_Textured,
      createModel_Colored,
      createModel_ColorTextured,
      createModel_TintTextured,
      renderPreppedModel
    });
  }();
  function BufferModel(program, data, stride, mode, texture2, prepDrawFunc) {
    if (!math2.isFloat32Array(data)) return console.error("Cannot create a buffer model without a Float32Array!");
    if (data.length % stride !== 0) return console.error("Data length is not divisible by stride when generating a buffer model! Perhaps did you pass in the wrong numPositionComponents, or use the wrong constructor?");
    if (!buffermodel.validRenderModes.includes(mode)) return console.error(`Mode "${mode}" is not an accepted value!`);
    this.data = data;
    const vertexCount = data.length / stride;
    let textureToRender = texture2;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl[buffermodel.DRAW_HINT]);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.updateBuffer = function() {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    };
    this.updateBufferIndices = function(changedIndicesStart, changedIndicesCount) {
      const endIndice = changedIndicesStart + changedIndicesCount - 1;
      if (endIndice > data.length - 1) return console.error("Cannot update buffer indices when they overflow the data.");
      const offsetInBytes = changedIndicesStart * data.BYTES_PER_ELEMENT;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, offsetInBytes, data.subarray(changedIndicesStart, changedIndicesStart + changedIndicesCount));
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    };
    this.deleteBuffer = function() {
      gl.deleteBuffer(buffer);
    };
    this.render = function(position, scale, customUniformValues) {
      prepDrawFunc(buffer, stride, data.BYTES_PER_ELEMENT);
      buffermodel.renderPreppedModel(program, position, scale, vertexCount, mode, textureToRender, customUniformValues);
    };
    this.getMode = function() {
      return mode;
    };
    this.getStride = function() {
      return stride;
    };
    if (textureToRender) {
      this.changeTexture = function changeTexture(newTexture) {
        textureToRender = newTexture;
      };
    }
  }

  // src/client/scripts/game/rendering/voids.mjs
  var voids = {
    color: [0, 0, 0, 1],
    color_wireframe: [1, 0, 1, 1],
    stride: 6,
    // Using color shader. Stride per VERTEX (2 vertex, 4 color)
    pointsPerSquare_Wireframe: 12,
    // Compared to  piecesmodel.pointsPerSquare  which is 6 when rendering triangles
    regenModel(gamefile2) {
      const voidList = game2.getGamefile().ourPieces.voidsN;
      const simplifiedMesh = voids.simplifyMesh(voidList);
      const rectangleCount = simplifiedMesh.length;
      const inDevMode = options2.isDebugModeOn();
      const thisPointsPerSquare = !inDevMode ? piecesmodel.pointsPerSquare : voids.pointsPerSquare_Wireframe;
      const indicesPerPiece = voids.stride * thisPointsPerSquare;
      const totalElements = rectangleCount * indicesPerPiece;
      gamefile2.voidMesh.data64 = new Float64Array(totalElements);
      gamefile2.voidMesh.data32 = new Float32Array(totalElements);
      let currIndex = 0;
      const data64 = gamefile2.voidMesh.data64;
      const data32 = gamefile2.voidMesh.data32;
      for (let i = 0; i < rectangleCount; i++) {
        const thisRect = simplifiedMesh[i];
        const { startX, startY, endX, endY } = voids.getCoordDataOfRectangle(gamefile2, thisRect);
        const colorToUse = !inDevMode ? voids.color : voids.color_wireframe;
        const funcToUse = !inDevMode ? voids.getDataOfSquare : voids.getDataOfSquare_Wireframe;
        const data = funcToUse(startX, startY, endX, endY, colorToUse);
        for (let a = 0; a < data.length; a++) {
          data64[currIndex] = data[a];
          data32[currIndex] = data[a];
          currIndex++;
        }
      }
      const mode = inDevMode ? "LINES" : "TRIANGLES";
      gamefile2.voidMesh.model = buffermodel.createModel_Colored(data32, 2, mode);
    },
    // The passed in sides should be the center-coordinate value of the square in the corner
    // For example, bottomleft square is [-5,-7], just pass in -5 for "left"
    getCoordDataOfRectangle(gamefile2, { left, right, bottom, top }) {
      const squareCenter = board.gsquareCenter();
      const startX = left - squareCenter - gamefile2.mesh.offset[0];
      const startY = bottom - squareCenter - gamefile2.mesh.offset[1];
      const width = right - left + 1;
      const height = top - bottom + 1;
      const endX = startX + width;
      const endY = startY + height;
      return { startX, startY, endX, endY };
    },
    // Returns an array of the data that can be entered into the buffer model!
    getDataOfSquare(startX, startY, endX, endY, color) {
      const [r, g, b, a] = color;
      return [
        //      Vertex               Color
        startX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        r,
        g,
        b,
        a
      ];
    },
    // Returns gl_lines data
    getDataOfSquare_Wireframe(startX, startY, endX, endY, color) {
      const [r, g, b, a] = color;
      return [
        //      Vertex               Color
        // Triangle 1
        startX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        startY,
        r,
        g,
        b,
        a,
        // Triangle 2
        endX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a
      ];
    },
    /**
     * Shifts the vertex data of the voids model and reinits it on the gpu.
     * @param {gamefile} gamefile - The gamefile
     * @param {number} diffXOffset - The x-amount to shift the voids vertex data
     * @param {number} diffYOffset - The y-amount to shift the voids vertex data
     */
    shiftModel(gamefile2, diffXOffset, diffYOffset) {
      const data64 = gamefile2.voidMesh.data64;
      const data32 = gamefile2.voidMesh.data32;
      for (let i = 0; i < data32.length; i += voids.stride) {
        data64[i] += diffXOffset;
        data64[i + 1] += diffYOffset;
        data32[i] = data64[i];
        data32[i + 1] = data64[i + 1];
      }
      gamefile2.voidMesh.model.updateBuffer();
    },
    /**
     * Simplifies a list of void squares and merges them into larger rectangles.
     * @param {array[]} voidList - The list of coordinates where all the voids are
     * @returns {array[]} An array of rectangles that look like: `{ left, right, bottom, top }`.
     */
    simplifyMesh(voidList) {
      const voidHash = {};
      for (const thisVoid of voidList) {
        const key = math2.getKeyFromCoords(thisVoid);
        voidHash[key] = true;
      }
      const rectangles = [];
      const alreadyMerged = {};
      for (const thisVoid of voidList) {
        const key = math2.getKeyFromCoords(thisVoid);
        if (alreadyMerged[key]) continue;
        alreadyMerged[key] = true;
        let left = thisVoid[0];
        let right = thisVoid[0];
        let bottom = thisVoid[1];
        let top = thisVoid[1];
        let width = 1;
        let height = 1;
        let foundNeighbor = true;
        while (foundNeighbor) {
          let potentialMergers = [];
          let allNeighborsAreVoid = true;
          let testX = left - 1;
          for (let a = 0; a < height; a++) {
            const thisTestY = bottom + a;
            const thisCoord = [testX, thisTestY];
            const thisKey = math2.getKeyFromCoords(thisCoord);
            const isVoid = voidHash[thisKey];
            if (!isVoid || alreadyMerged[thisKey]) {
              allNeighborsAreVoid = false;
              break;
            }
            potentialMergers.push(thisKey);
          }
          if (allNeighborsAreVoid) {
            left = testX;
            width++;
            potentialMergers.forEach((key2) => {
              alreadyMerged[key2] = true;
            });
            continue;
          }
          potentialMergers = [];
          allNeighborsAreVoid = true;
          testX = right + 1;
          for (let a = 0; a < height; a++) {
            const thisTestY = bottom + a;
            const thisCoord = [testX, thisTestY];
            const thisKey = math2.getKeyFromCoords(thisCoord);
            const isVoid = voidHash[thisKey];
            if (!isVoid || alreadyMerged[thisKey]) {
              allNeighborsAreVoid = false;
              break;
            }
            potentialMergers.push(thisKey);
          }
          if (allNeighborsAreVoid) {
            right = testX;
            width++;
            potentialMergers.forEach((key2) => {
              alreadyMerged[key2] = true;
            });
            continue;
          }
          potentialMergers = [];
          allNeighborsAreVoid = true;
          let testY = bottom - 1;
          for (let a = 0; a < width; a++) {
            const thisTestX = left + a;
            const thisCoord = [thisTestX, testY];
            const thisKey = math2.getKeyFromCoords(thisCoord);
            const isVoid = voidHash[thisKey];
            if (!isVoid || alreadyMerged[thisKey]) {
              allNeighborsAreVoid = false;
              break;
            }
            potentialMergers.push(thisKey);
          }
          if (allNeighborsAreVoid) {
            bottom = testY;
            height++;
            potentialMergers.forEach((key2) => {
              alreadyMerged[key2] = true;
            });
            continue;
          }
          potentialMergers = [];
          allNeighborsAreVoid = true;
          testY = top + 1;
          for (let a = 0; a < width; a++) {
            const thisTestX = left + a;
            const thisCoord = [thisTestX, testY];
            const thisKey = math2.getKeyFromCoords(thisCoord);
            const isVoid = voidHash[thisKey];
            if (!isVoid || alreadyMerged[thisKey]) {
              allNeighborsAreVoid = false;
              break;
            }
            potentialMergers.push(thisKey);
          }
          if (allNeighborsAreVoid) {
            top = testY;
            height++;
            potentialMergers.forEach((key2) => {
              alreadyMerged[key2] = true;
            });
            continue;
          }
          foundNeighbor = false;
        }
        const rectangle = { left, right, bottom, top };
        rectangles.push(rectangle);
      }
      return rectangles;
    },
    // Called from pieces.renderPiecesInGame()
    render(gamefile2) {
      if (gamefile2.voidMesh.model == null) return;
      const boardPos = movement.getBoardPos();
      const position = [
        // Translate
        -boardPos[0] + gamefile2.mesh.offset[0],
        // Add the model's offset. 
        -boardPos[1] + gamefile2.mesh.offset[1],
        0
      ];
      const boardScale = movement.getBoardScale();
      const scale = [boardScale, boardScale, 1];
      gamefile2.voidMesh.model.render(position, scale);
    }
  };

  // src/client/scripts/game/rendering/miniimage.mjs
  var miniimage = function() {
    const width = 36;
    let widthWorld;
    const opacity = 0.6;
    let data = [];
    let model;
    let piecesClicked = [];
    let hovering = false;
    let disabled = false;
    function gwidthWorld() {
      return widthWorld;
    }
    function recalcWidthWorld() {
      widthWorld = math2.convertPixelsToWorldSpace_Virtual(width);
    }
    function gopacity() {
      return opacity;
    }
    function isHovering() {
      return hovering;
    }
    function isDisabled() {
      return disabled;
    }
    function enable() {
      disabled = false;
    }
    function disable() {
      disabled = true;
    }
    function testIfToggled() {
      if (!input2.isKeyDown("p")) return;
      disabled = !disabled;
      main2.renderThisFrame();
      if (disabled) statustext2.showStatus(translations["rendering"]["icon_rendering_off"]);
      else statustext2.showStatus(translations["rendering"]["icon_rendering_on"]);
    }
    function genModel() {
      hovering = false;
      if (!movement.isScaleLess1Pixel_Virtual()) return;
      if (disabled) return;
      data = [];
      piecesClicked = [];
      if (widthWorld == null) console.error("widthWorld is not defined yet");
      const halfWidth = widthWorld / 2;
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      pieces.forEachPieceType(concatBufferData, { ignoreVoids: true });
      function concatBufferData(pieceType) {
        const thesePieces = game2.getGamefile().ourPieces[pieceType];
        if (!thesePieces) return;
        const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(pieceType, rotation);
        const { r, g, b } = options2.getColorOfType(pieceType);
        for (let i = 0; i < thesePieces.length; i++) {
          const thisPiece = thesePieces[i];
          if (!thisPiece) continue;
          const startX = (thisPiece[0] - boardPos[0]) * boardScale - halfWidth;
          const startY = (thisPiece[1] - boardPos[1]) * boardScale - halfWidth;
          const endX = startX + widthWorld;
          const endY = startY + widthWorld;
          let thisOpacity = opacity;
          const touchClicked = input2.getTouchClicked();
          const mouseWorldLocation = touchClicked ? input2.getTouchClickedWorld() : input2.getMouseWorldLocation();
          const mouseWorldX = mouseWorldLocation[0];
          const mouseWorldY = mouseWorldLocation[1];
          if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
            thisOpacity = 1;
            hovering = true;
            if (input2.isMouseDown_Left() || input2.getTouchClicked()) {
              piecesClicked.push(thisPiece);
            }
          }
          const newData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, thisOpacity);
          data.push(...newData);
        }
      }
      const floatData = new Float32Array(data);
      model = buffermodel.createModel_ColorTextured(floatData, 2, "TRIANGLES", pieces.getSpritesheet());
      if (piecesClicked.length > 0) {
        const theArea = area.calculateFromCoordsList(piecesClicked);
        const endCoords = theArea.coords;
        const endScale = theArea.scale;
        const tel = { endCoords, endScale };
        transition2.teleport(tel);
        if (!input2.getTouchClicked()) input2.removeMouseDown_Left();
      }
    }
    function render() {
      if (!movement.isScaleLess1Pixel_Virtual()) return;
      if (disabled) return;
      if (!model) genModel();
      webgl.executeWithDepthFunc_ALWAYS(() => {
        model.render();
      });
    }
    return Object.freeze({
      gwidthWorld,
      gopacity,
      isHovering,
      isDisabled,
      testIfToggled,
      genModel,
      render,
      enable,
      disable,
      recalcWidthWorld
    });
  }();

  // src/client/scripts/game/rendering/pieces.mjs
  var pieces = function() {
    const white = ["kingsW", "giraffesW", "camelsW", "zebrasW", "knightridersW", "amazonsW", "queensW", "royalQueensW", "hawksW", "chancellorsW", "archbishopsW", "centaursW", "royalCentaursW", "knightsW", "guardsW", "rooksW", "bishopsW", "pawnsW"];
    const black = ["kingsB", "giraffesB", "camelsB", "zebrasB", "knightridersB", "amazonsB", "queensB", "royalQueensB", "hawksB", "chancellorsB", "archbishopsB", "centaursB", "royalCentaursB", "knightsB", "guardsB", "rooksB", "bishopsB", "pawnsB"];
    const neutral = ["obstaclesN", "voidsN"];
    const royals = ["kings", "royalQueens", "royalCentaurs"];
    const jumpingRoyals = ["kings", "royalCentaurs"];
    let spritesheet;
    let spritesheetData;
    const ghostOpacity = 0.4;
    const extraUndefineds = 5;
    function renderPiecesInGame(gamefile2) {
      renderPieces(gamefile2);
      voids.render(gamefile2);
      miniimage.render();
    }
    function renderPieces(gamefile2) {
      if (gamefile2.mesh == null) return;
      if (gamefile2.mesh.model == null) return;
      if (movement.isScaleLess1Pixel_Virtual() && !miniimage.isDisabled()) return;
      if (!movement.isScaleLess1Pixel_Virtual() && board2.isOffsetOutOfRangeOfRegenRange(gamefile2.mesh.offset, piecesmodel.regenRange)) piecesmodel.shiftPiecesModel(gamefile2);
      const boardPos = movement.getBoardPos();
      const position = [
        // Translate
        -boardPos[0] + gamefile2.mesh.offset[0],
        // Add the model's offset. 
        -boardPos[1] + gamefile2.mesh.offset[1],
        0
      ];
      const boardScale = movement.getBoardScale();
      const scale = [boardScale, boardScale, 1];
      let modelToUse;
      if (onlinegame2.areWeColor("black")) modelToUse = perspective2.getEnabled() && !perspective2.getIsViewingBlackPerspective() && gamefile2.mesh.rotatedModel != null ? gamefile2.mesh.rotatedModel : gamefile2.mesh.model;
      else modelToUse = perspective2.getEnabled() && perspective2.getIsViewingBlackPerspective() && gamefile2.mesh.rotatedModel != null ? gamefile2.mesh.rotatedModel : gamefile2.mesh.model;
      modelToUse.render(position, scale);
    }
    function renderGhostPiece(type, coords) {
      const color = options2.getColorOfType(type);
      color.a *= ghostOpacity;
      const data = bufferdata.getDataQuad_ColorTexture_FromCoordAndType(coords, type, color);
      const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", pieces.getSpritesheet());
      model.render();
    }
    function forEachPieceType(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) {
      for (let i = 0; i < white.length; i++) {
        callback(black[i]);
        callback(white[i]);
      }
      if (ignoreNeutrals) return;
      for (let i = 0; i < neutral.length; i++) {
        const type = neutral[i];
        if (ignoreVoids && type.startsWith("voids")) continue;
        callback(type);
      }
    }
    async function forEachPieceType_Async(callback, { ignoreNeutrals = false, ignoreVoids = false } = {}) {
      for (let i = 0; i < white.length; i++) {
        await callback(black[i]);
        await callback(white[i]);
      }
      if (ignoreNeutrals) return;
      for (let i = 0; i < neutral.length; i++) {
        const type = neutral[i];
        if (ignoreVoids && type.startsWith("voids")) continue;
        await callback(type);
      }
    }
    function forEachPieceTypeOfColor(color, callback) {
      if (color !== "white" && color !== "black") throw new Error(`Cannot iterate through each piece type of invalid color: ${color}!`);
      for (let i = 0; i < white.length; i++) callback(pieces[color][i]);
    }
    function initSpritesheet() {
      spritesheet = texture.loadTexture("spritesheet", { useMipmaps: true });
    }
    function getSpritesheet() {
      return spritesheet;
    }
    function initSpritesheetData() {
      const pieceWidth = 1 / 8;
      spritesheetData = {
        pieceWidth,
        // One-sided pieces
        pawnsW: getSpriteCoords(pieceWidth, 1, 1),
        pawnsB: getSpriteCoords(pieceWidth, 2, 1),
        knightsW: getSpriteCoords(pieceWidth, 3, 1),
        knightsB: getSpriteCoords(pieceWidth, 4, 1),
        bishopsW: getSpriteCoords(pieceWidth, 5, 1),
        bishopsB: getSpriteCoords(pieceWidth, 6, 1),
        rooksW: getSpriteCoords(pieceWidth, 7, 1),
        rooksB: getSpriteCoords(pieceWidth, 8, 1),
        queensW: getSpriteCoords(pieceWidth, 1, 2),
        queensB: getSpriteCoords(pieceWidth, 2, 2),
        kingsW: getSpriteCoords(pieceWidth, 3, 2),
        kingsB: getSpriteCoords(pieceWidth, 4, 2),
        chancellorsW: getSpriteCoords(pieceWidth, 5, 2),
        chancellorsB: getSpriteCoords(pieceWidth, 6, 2),
        archbishopsW: getSpriteCoords(pieceWidth, 7, 2),
        archbishopsB: getSpriteCoords(pieceWidth, 8, 2),
        amazonsW: getSpriteCoords(pieceWidth, 1, 3),
        amazonsB: getSpriteCoords(pieceWidth, 2, 3),
        // Guard texture for the guard
        guardsW: getSpriteCoords(pieceWidth, 3, 3),
        guardsB: getSpriteCoords(pieceWidth, 4, 3),
        // Commoner texture for the guard
        // guardsW: getSpriteCoords(pieceWidth, 5,3),
        // guardsB: getSpriteCoords(pieceWidth, 6,3),
        hawksW: getSpriteCoords(pieceWidth, 7, 3),
        hawksB: getSpriteCoords(pieceWidth, 8, 3),
        camelsW: getSpriteCoords(pieceWidth, 1, 4),
        camelsB: getSpriteCoords(pieceWidth, 2, 4),
        giraffesW: getSpriteCoords(pieceWidth, 3, 4),
        giraffesB: getSpriteCoords(pieceWidth, 4, 4),
        zebrasW: getSpriteCoords(pieceWidth, 5, 4),
        zebrasB: getSpriteCoords(pieceWidth, 6, 4),
        knightridersW: getSpriteCoords(pieceWidth, 7, 4),
        knightridersB: getSpriteCoords(pieceWidth, 8, 4),
        unicornsW: getSpriteCoords(pieceWidth, 1, 5),
        unicornsB: getSpriteCoords(pieceWidth, 2, 5),
        evolvedUnicornsW: getSpriteCoords(pieceWidth, 3, 5),
        evolvedUnicornsB: getSpriteCoords(pieceWidth, 4, 5),
        rosesW: getSpriteCoords(pieceWidth, 5, 5),
        rosesB: getSpriteCoords(pieceWidth, 6, 5),
        centaursW: getSpriteCoords(pieceWidth, 7, 5),
        centaursB: getSpriteCoords(pieceWidth, 8, 5),
        royalCentaursW: getSpriteCoords(pieceWidth, 1, 6),
        royalCentaursB: getSpriteCoords(pieceWidth, 2, 6),
        royalQueensW: getSpriteCoords(pieceWidth, 3, 6),
        royalQueensB: getSpriteCoords(pieceWidth, 4, 6),
        kelpiesW: getSpriteCoords(pieceWidth, 5, 6),
        kelpiesB: getSpriteCoords(pieceWidth, 6, 6),
        dragonsW: getSpriteCoords(pieceWidth, 7, 6),
        dragonsB: getSpriteCoords(pieceWidth, 8, 6),
        // 2nd dragon texture, also used in 5D chess.
        drakonsW: getSpriteCoords(pieceWidth, 1, 7),
        drakonsB: getSpriteCoords(pieceWidth, 2, 7),
        // Neutral pieces
        air: getSpriteCoords(pieceWidth, 3, 7),
        obstaclesN: getSpriteCoords(pieceWidth, 4, 7),
        // Miscellaneous
        yellow: getSpriteCoords(pieceWidth, 5, 7)
        // COIN
      };
      function getSpriteCoords(pieceWidth2, xPos, yPos) {
        const texX = (xPos - 1) * pieceWidth2;
        const texY = 1 - yPos * pieceWidth2;
        return [texX, texY];
      }
    }
    function getSpritesheetDataPieceWidth() {
      return spritesheetData.pieceWidth;
    }
    function getSpritesheetDataTexLocation(type) {
      return spritesheetData[type];
    }
    return Object.freeze({
      white,
      black,
      neutral,
      royals,
      jumpingRoyals,
      extraUndefineds,
      renderPiecesInGame,
      renderGhostPiece,
      forEachPieceType,
      forEachPieceType_Async,
      forEachPieceTypeOfColor,
      initSpritesheet,
      getSpritesheet,
      initSpritesheetData,
      getSpritesheetDataPieceWidth,
      getSpritesheetDataTexLocation
    });
  }();

  // src/client/scripts/game/rendering/piecesmodel.mjs
  var piecesmodel = {
    strideWithTexture: 4,
    // Using texture shader. Stride per VERTEX
    strideWithColoredTexture: 8,
    pointsPerSquare: 6,
    // Number of vertices used to render a square (2 triangles)
    /**
     * The interval at which to modify the mesh's linear offset once you travel this distance.
     * 10,000 was arbitrarily chose because once you reach uniform translations much bigger
     * than that, the rendering of the pieces start to get gittery.
     */
    regenRange: 1e4,
    /**
     * Generates the model that contains every single piece on the board, *including* coins, but *excluding* voids.
     * (But will herein call the method that regenerates the void mesh)
     * This is expensive. This is ~200 times slower than just rendering. Minimize calling this.
     * When drawing, we'll need to specify the uniform transformations according to our camera position.
     * @param {gamefile} gamefile - The gamefile of which to regenerate the mesh of the pieces
     * @param {Object} [colorArgs] - Optional. The color arguments to dye the pieces a custom tint. Example: `{ white: [r,g,b,a], black: [r,g,b,a] }`
     * @param {boolean} [giveStatus] Optional. If true, displays a message when the model is complete. Default: false
     */
    regenModel: async function(gamefile2, colorArgs, giveStatus) {
      if (!gamefile2) return;
      if (gamefile2.mesh.isGenerating) return;
      gamefile2.mesh.locked++;
      gamefile2.mesh.isGenerating++;
      console.log("Regenerating pieces model.");
      gamefile2.mesh.offset = math2.roundPointToNearestGridpoint(movement.getBoardPos(), piecesmodel.regenRange);
      const coinCount = coin.getCoinCount();
      const totalPieceCount = gamefileutility2.getPieceCount(game2.getGamefile().ourPieces) + coinCount;
      const thisStride = colorArgs ? piecesmodel.strideWithColoredTexture : piecesmodel.strideWithTexture;
      const indicesPerPiece = thisStride * piecesmodel.pointsPerSquare;
      const totalElements = totalPieceCount * indicesPerPiece;
      const usingColoredTextures = colorArgs != null;
      const mesh = {
        data64: new Float64Array(totalElements),
        // Inits all 0's to begin..
        data32: new Float32Array(totalElements),
        // Inits all 0's to begin..
        stride: thisStride,
        /** @type {BufferModel} */
        model: void 0,
        usingColoredTextures
      };
      const weAreBlack = onlinegame2.areInOnlineGame() && onlinegame2.areWeColor("black");
      const rotation = weAreBlack ? -1 : 1;
      let currIndex = 0;
      currIndex = coin.appDat(gamefile2, currIndex, mesh, usingColoredTextures);
      let pieceLimitToRecalcTime = 1e3;
      let startTime = performance.now();
      let timeToStop = startTime + loadbalancer2.getLongTaskTime();
      let piecesSinceLastCheck = 0;
      let piecesComplete = 0;
      stats.showPiecesMesh();
      await pieces.forEachPieceType_Async(concatBufferData, { ignoreVoids: true });
      async function concatBufferData(pieceType) {
        if (gamefile2.mesh.terminate) return;
        const thesePieces = game2.getGamefile().ourPieces[pieceType];
        const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(pieceType, rotation);
        if (colorArgs) {
          const pieceColor = math2.getPieceColorFromType(pieceType);
          const colorArray = colorArgs[pieceColor];
          var r = colorArray[0];
          var g = colorArray[1];
          var b = colorArray[2];
          var a = colorArray[3];
        }
        for (let i = 0; i < thesePieces.length; i++) {
          const thisPiece = thesePieces[i];
          if (!thisPiece) {
            currIndex += indicesPerPiece;
            continue;
          }
          const { startX, startY, endX, endY } = bufferdata.getCoordDataOfTile_WithOffset(gamefile2.mesh.offset, thisPiece);
          const data = colorArgs ? bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a) : bufferdata.getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY);
          for (let a2 = 0; a2 < data.length; a2++) {
            mesh.data64[currIndex] = data[a2];
            mesh.data32[currIndex] = data[a2];
            currIndex++;
          }
          piecesSinceLastCheck++;
          piecesComplete++;
          if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
            piecesSinceLastCheck = 0;
            await sleepIfUsedTooMuchTime();
            if (gamefile2.mesh.terminate) return;
            if (main2.gforceCalc()) {
              pieceLimitToRecalcTime = Infinity;
              main2.sforceCalc(false);
            }
          }
        }
      }
      async function sleepIfUsedTooMuchTime() {
        if (!usedTooMuchTime()) return;
        const percentComplete = piecesComplete / totalPieceCount;
        stats.updatePiecesMesh(percentComplete);
        await main2.sleep(0);
        startTime = performance.now();
        timeToStop = startTime + loadbalancer2.getLongTaskTime();
      }
      function usedTooMuchTime() {
        return performance.now() >= timeToStop;
      }
      stats.hidePiecesMesh();
      if (gamefile2.mesh.terminate) {
        console.log("Mesh generation terminated.");
        gamefile2.mesh.terminate = false;
        gamefile2.mesh.locked--;
        gamefile2.mesh.isGenerating--;
        return;
      }
      main2.enableForceRender();
      mesh.model = colorArgs ? buffermodel.createModel_ColorTextured(mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet()) : buffermodel.createModel_Textured(mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet());
      math2.copyPropertiesToObject(mesh, gamefile2.mesh);
      if (perspective2.getEnabled()) await piecesmodel.initRotatedPiecesModel(game2.getGamefile(), true);
      if (gamefile2.mesh.terminate) {
        gamefile2.mesh.terminate = false;
        gamefile2.mesh.locked--;
        gamefile2.mesh.isGenerating--;
        return;
      }
      voids.regenModel(gamefile2);
      if (giveStatus) statustext2.showStatus(translations["rendering"]["regenerated_pieces"], false, 0.5);
      main2.renderThisFrame();
      main2.enableForceRender();
      gamefile2.mesh.locked--;
      gamefile2.mesh.isGenerating--;
      console.log("Done!");
    },
    /**
     * Modifies the vertex data of the specified piece within the game's mesh data
     * to the destination coordinates. Then sends that change off to the gpu.
     * FAST, much faster than regenerating the entire mesh!
     * @param {gamefile} gamefile - The gamefile the piece belongs to
     * @param {Object} piece - The piece: `{ type, index }`
     * @param {number[]} newCoords - The destination coordinates
     */
    movebufferdata(gamefile2, piece, newCoords) {
      if (!gamefile2.mesh.data64) throw new Error("Should not be moving piece data when data64 is not defined!");
      if (!gamefile2.mesh.data32) throw new Error("Should not be moving piece data when data32 is not defined!");
      const index = piecesmodel.getPieceIndexInData(gamefile2, piece);
      const stridePerPiece = gamefile2.mesh.stride * piecesmodel.pointsPerSquare;
      const i = index * stridePerPiece;
      const { startX, startY, endX, endY } = bufferdata.getCoordDataOfTile_WithOffset(gamefile2.mesh.offset, newCoords);
      const stride = gamefile2.mesh.stride;
      moveData(gamefile2.mesh.data64);
      moveData(gamefile2.mesh.data32);
      if (perspective2.getEnabled()) {
        moveData(gamefile2.mesh.rotatedData64);
        moveData(gamefile2.mesh.rotatedData32);
      }
      function moveData(array) {
        array[i] = startX;
        array[i + 1] = startY;
        array[i + stride * 1] = startX;
        array[i + stride * 1 + 1] = endY;
        array[i + stride * 2] = endX;
        array[i + stride * 2 + 1] = startY;
        array[i + stride * 3] = endX;
        array[i + stride * 3 + 1] = startY;
        array[i + stride * 4] = startX;
        array[i + stride * 4 + 1] = endY;
        array[i + stride * 5] = endX;
        array[i + stride * 5 + 1] = endY;
      }
      const numbIndicesChanged = stride * 5 + 2;
      gamefile2.mesh.model.updateBufferIndices(i, numbIndicesChanged);
      if (perspective2.getEnabled()) gamefile2.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
    },
    // Overwrites the piece's vertex data with 0's, 
    /**
     * Overwrites the vertex data of the specified piece with 0's within the game's mesh data,
     * INCLUDING its texture coords! Then sends that change off to the gpu.
     * FAST, much faster than regenerating the entire mesh!
     * @param {gamefile} gamefile - The gamefile the piece belongs to
     * @param {Object} piece - The piece: `{ type, index }`
     */
    deletebufferdata(gamefile2, piece) {
      if (!gamefile2.mesh.data64) throw new Error("Should not be deleting piece data when data64 is not defined!");
      if (!gamefile2.mesh.data32) throw new Error("Should not be deleting piece data when data32 is not defined!");
      const index = piecesmodel.getPieceIndexInData(gamefile2, piece);
      const stridePerPiece = gamefile2.mesh.stride * piecesmodel.pointsPerSquare;
      const i = index * stridePerPiece;
      for (let a = 0; a < stridePerPiece; a++) {
        const thisIndex = i + a;
        gamefile2.mesh.data64[thisIndex] = 0;
        gamefile2.mesh.data32[thisIndex] = 0;
      }
      if (perspective2.getEnabled()) {
        for (let a = 0; a < stridePerPiece; a++) {
          const thisIndex = i + a;
          gamefile2.mesh.rotatedData64[thisIndex] = 0;
          gamefile2.mesh.rotatedData32[thisIndex] = 0;
        }
      }
      const numbIndicesChanged = stridePerPiece;
      gamefile2.mesh.model.updateBufferIndices(i, numbIndicesChanged);
      if (perspective2.getEnabled()) gamefile2.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
    },
    /**
     * Overwrites the vertex data of the specified piece within the game's mesh data
     * with the specified piece type. Then sends that change off to the gpu.
     * Typically call this to overwrite exising placeholder 0's, such as when pawns promote.
     * FAST, much faster than regenerating the entire mesh!
     * @param {gamefile} gamefile - The gamefile the piece belongs to
     * @param {Object} undefinedPiece - The undefined piece placeholder: `{ type, index }`
     * @param {number[]} coords - The destination coordinates
     * @param {string} type - The type of piece to write
     */
    overwritebufferdata(gamefile2, undefinedPiece, coords, type) {
      if (!gamefile2.mesh.data64) return console.error("Should not be overwriting piece data when data64 is not defined!");
      if (!gamefile2.mesh.data32) return console.error("Should not be overwriting piece data when data32 is not defined!");
      const index = piecesmodel.getPieceIndexInData(gamefile2, undefinedPiece);
      const stridePerPiece = gamefile2.mesh.stride * piecesmodel.pointsPerSquare;
      const i = index * stridePerPiece;
      const weAreBlack = onlinegame2.areInOnlineGame() && onlinegame2.areWeColor("black");
      const rotation = weAreBlack ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation);
      const { startX, startY, endX, endY } = bufferdata.getCoordDataOfTile_WithOffset(gamefile2.mesh.offset, coords);
      let data;
      if (gamefile2.mesh.usingColoredTextures) {
        const colorArgs = options.getPieceRegenColorArgs();
        const pieceColor = math2.getPieceColorFromType(type);
        const colorArray = colorArgs[pieceColor];
        const [r, g, b, a] = colorArray;
        data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
      } else data = bufferdata.getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY);
      for (let a = 0; a < data.length; a++) {
        const thisIndex = i + a;
        gamefile2.mesh.data64[thisIndex] = data[a];
        gamefile2.mesh.data32[thisIndex] = data[a];
      }
      if (perspective2.getEnabled()) {
        const usingColoredPieces = gamefile2.mesh.usingColoredTextures;
        const rotatedData = usingColoredPieces ? bufferdata.rotateDataColorTexture(data, rotation) : bufferdata.rotateDataTexture(data, rotation);
        for (let a = 0; a < rotatedData.length; a++) {
          const thisIndex = i + a;
          gamefile2.mesh.rotatedData64[thisIndex] = rotatedData[a];
          gamefile2.mesh.rotatedData32[thisIndex] = rotatedData[a];
        }
      }
      const numbIndicesChanged = data.length;
      gamefile2.mesh.model.updateBufferIndices(i, numbIndicesChanged);
      if (perspective2.getEnabled()) gamefile2.mesh.rotatedModel.updateBufferIndices(i, numbIndicesChanged);
    },
    // Appends the index to account for coins within the data!
    /**
     * Calculates the specified piece's index, or position in line,
     * within the mesh vertex data of the gamefile.
     * Takes into account that coins are in the mesh as well.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} piece - The piece: { type, index }
     * @returns {number} The index of the piece within the mesh
     */
    getPieceIndexInData(gamefile2, piece) {
      const index = gamefileutility2.calcPieceIndexInAllPieces(gamefile2, piece);
      return index + coin.getCoinCount();
    },
    /**
     * Utility function for printing the vertex data of the specific piece at
     * the specified coords, within the mesh data of the gamefile.
     * @param {gamefile} coords - The gamefile
     * @param {number[]} coords - The coordiantes of the piece
     */
    printbufferdataOnCoords(gamefile2, coords) {
      const piece = gamefileutility2.getPieceAtCoords(gamefile2, coords);
      if (!piece) console.log("No piece at these coords to retrieve data from!");
      const index = piecesmodel.getPieceIndexInData(gamefile2, piece);
      piecesmodel.printbufferdataOnIndex(index);
    },
    /**
     * Utility function for printing the vertex data of the specific
     * piece index within the mesh data of the gamefile.
     * Call `printbufferdataOnCoords()` if you don't know the piece's index.
     * @param {gamefile} coords - The gamefile
     * @param {number[]} coords - The coordiantes of the piece
     */
    printbufferdataOnIndex(gamefile2, index) {
      const stridePerPiece = gamefile2.mesh.stride * piecesmodel.pointsPerSquare;
      const i = index * stridePerPiece;
      for (let a = 0; a < stridePerPiece; a++) {
        const thisIndex = i + a;
        console.log(gamefile2.mesh.data32[thisIndex]);
      }
    },
    // Shifts every piece in the model to the nearest regenRange. 
    /**
     * Shifts the data linearly within the gamefile's mesh so that it's closer to the
     * origin, requiring less severe uniform translations upon rendering.
     * The amount it is shifted depends on the nearest `regenRange`.
     * ~50% faster than using `regenPiecesModel()` to regenerate the entire mesh.
     * @param {gamefile} gamefile - The gamefile
     */
    shiftPiecesModel: function(gamefile2) {
      console.log("Shifting pieces model..");
      main2.renderThisFrame();
      const newOffset = math2.roundPointToNearestGridpoint(movement.getBoardPos(), piecesmodel.regenRange);
      const diffXOffset = gamefile2.mesh.offset[0] - newOffset[0];
      const diffYOffset = gamefile2.mesh.offset[1] - newOffset[1];
      gamefile2.mesh.offset = newOffset;
      if (perspective2.getEnabled()) shiftBothModels();
      else shiftMainModel();
      function shiftMainModel() {
        for (let i = 0; i < gamefile2.mesh.data32.length; i += gamefile2.mesh.stride) {
          gamefile2.mesh.data64[i] += diffXOffset;
          gamefile2.mesh.data64[i + 1] += diffYOffset;
          gamefile2.mesh.data32[i] = gamefile2.mesh.data64[i];
          gamefile2.mesh.data32[i + 1] = gamefile2.mesh.data64[i + 1];
        }
        gamefile2.mesh.model = gamefile2.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile2.mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet()) : buffermodel.createModel_Textured(gamefile2.mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet());
      }
      function shiftBothModels() {
        for (let i = 0; i < gamefile2.mesh.data32.length; i += gamefile2.mesh.stride) {
          gamefile2.mesh.data64[i] += diffXOffset;
          gamefile2.mesh.data64[i + 1] += diffYOffset;
          gamefile2.mesh.data32[i] = gamefile2.mesh.data64[i];
          gamefile2.mesh.data32[i + 1] = gamefile2.mesh.data64[i + 1];
          gamefile2.mesh.rotatedData64[i] += diffXOffset;
          gamefile2.mesh.rotatedData64[i + 1] += diffYOffset;
          gamefile2.mesh.rotatedData32[i] = gamefile2.mesh.rotatedData64[i];
          gamefile2.mesh.rotatedData32[i + 1] = gamefile2.mesh.rotatedData64[i + 1];
        }
        gamefile2.mesh.model = gamefile2.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile2.mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet()) : buffermodel.createModel_Textured(gamefile2.mesh.data32, 2, "TRIANGLES", pieces.getSpritesheet());
        gamefile2.mesh.rotatedModel = gamefile2.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile2.mesh.rotatedData32, 2, "TRIANGLES", pieces.getSpritesheet()) : buffermodel.createModel_Textured(gamefile2.mesh.rotatedData32, 2, "TRIANGLES", pieces.getSpritesheet());
      }
      voids.shiftModel(gamefile2, diffXOffset, diffYOffset);
    },
    /**
     * Generates the rotated-180° mesh of the pieces used when perspective
     * mode is enabled and we view our opponent's perspective.
     * About same speed as `regenPiecesModel()`.
     * @param {gamefile} gamefile - The gamefile of which to regenerate the mesh of the pieces
     * @param {boolean} [ignoreGenerating] Optional. If true, the function will run regardless if the mesh is currently being calculated. This is useful to prevent running the function twice at the same time. Default: *false*
     */
    initRotatedPiecesModel: async function(gamefile2, ignoreGenerating = false) {
      if (gamefile2.mesh.model == null) return;
      if (gamefile2.mesh.isGenerating && !ignoreGenerating) return;
      gamefile2.mesh.locked++;
      gamefile2.mesh.isGenerating++;
      console.log("Rotating pieces model..");
      main2.renderThisFrame();
      const weAreBlack = onlinegame2.areInOnlineGame() && onlinegame2.areWeColor("black");
      const texWidth = weAreBlack ? -pieces.getSpritesheetDataPieceWidth() : pieces.getSpritesheetDataPieceWidth();
      gamefile2.mesh.rotatedData64 = new Float64Array(gamefile2.mesh.data32.length);
      gamefile2.mesh.rotatedData32 = new Float32Array(gamefile2.mesh.data32.length);
      const stride = gamefile2.mesh.stride;
      const indicesPerPiece = stride * piecesmodel.pointsPerSquare;
      const coinCount = coin.getCoinCount();
      const totalPieceCount = (gamefileutility2.getPieceCount(game2.getGamefile().ourPieces) + coinCount) * 2;
      let pieceLimitToRecalcTime = 1e3;
      let startTime = performance.now();
      let timeToStop = startTime + loadbalancer2.getLongTaskTime();
      let piecesSinceLastCheck = 0;
      let piecesComplete = 0;
      stats.showRotateMesh();
      const funcToUse = gamefile2.mesh.usingColoredTextures ? rotateDataColorTexture : rotateDataTexture;
      await funcToUse(gamefile2.mesh.data64, gamefile2.mesh.rotatedData64);
      if (gamefile2.mesh.terminate) {
        console.log("Mesh generation terminated.");
        stats.hideRotateMesh();
        if (!ignoreGenerating) gamefile2.mesh.terminate = false;
        gamefile2.mesh.locked--;
        gamefile2.mesh.isGenerating--;
        return;
      }
      await funcToUse(gamefile2.mesh.data32, gamefile2.mesh.rotatedData32);
      if (gamefile2.mesh.terminate) {
        console.log("Mesh generation terminated.");
        stats.hideRotateMesh();
        if (!ignoreGenerating) gamefile2.mesh.terminate = false;
        gamefile2.mesh.locked--;
        gamefile2.mesh.isGenerating--;
        return;
      }
      async function rotateDataTexture(sourceArray, destArray) {
        for (let i = 0; i < gamefile2.mesh.data32.length; i += indicesPerPiece) {
          destArray[i] = sourceArray[i];
          destArray[i + 1] = sourceArray[i + 1];
          destArray[i + 2] = sourceArray[i + 2] + texWidth;
          destArray[i + 3] = sourceArray[i + 3] + texWidth;
          destArray[i + 4] = sourceArray[i + 4];
          destArray[i + 5] = sourceArray[i + 5];
          destArray[i + 6] = sourceArray[i + 6] + texWidth;
          destArray[i + 7] = sourceArray[i + 7] - texWidth;
          destArray[i + 8] = sourceArray[i + 8];
          destArray[i + 9] = sourceArray[i + 9];
          destArray[i + 10] = sourceArray[i + 10] - texWidth;
          destArray[i + 11] = sourceArray[i + 11] + texWidth;
          destArray[i + 12] = sourceArray[i + 12];
          destArray[i + 13] = sourceArray[i + 13];
          destArray[i + 14] = sourceArray[i + 14] - texWidth;
          destArray[i + 15] = sourceArray[i + 15] + texWidth;
          destArray[i + 16] = sourceArray[i + 16];
          destArray[i + 17] = sourceArray[i + 17];
          destArray[i + 18] = sourceArray[i + 18] + texWidth;
          destArray[i + 19] = sourceArray[i + 19] - texWidth;
          destArray[i + 20] = sourceArray[i + 20];
          destArray[i + 21] = sourceArray[i + 21];
          destArray[i + 22] = sourceArray[i + 22] - texWidth;
          destArray[i + 23] = sourceArray[i + 23] - texWidth;
          piecesSinceLastCheck++;
          piecesComplete++;
          if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
            piecesSinceLastCheck = 0;
            await sleepIfUsedTooMuchTime();
            if (gamefile2.mesh.terminate) return;
            if (main2.gforceCalc()) {
              pieceLimitToRecalcTime = Infinity;
              main2.sforceCalc(false);
            }
          }
        }
      }
      async function rotateDataColorTexture(sourceArray, destArray) {
        for (let i = 0; i < gamefile2.mesh.data32.length; i += indicesPerPiece) {
          destArray[i] = sourceArray[i];
          destArray[i + 1] = sourceArray[i + 1];
          destArray[i + 2] = sourceArray[i + 2] + texWidth;
          destArray[i + 3] = sourceArray[i + 3] + texWidth;
          destArray[i + 4] = sourceArray[i + 4];
          destArray[i + 5] = sourceArray[i + 5];
          destArray[i + 6] = sourceArray[i + 6];
          destArray[i + 7] = sourceArray[i + 7];
          destArray[i + 8] = sourceArray[i + 8];
          destArray[i + 9] = sourceArray[i + 9];
          destArray[i + 10] = sourceArray[i + 10] + texWidth;
          destArray[i + 11] = sourceArray[i + 11] - texWidth;
          destArray[i + 12] = sourceArray[i + 12];
          destArray[i + 13] = sourceArray[i + 13];
          destArray[i + 14] = sourceArray[i + 14];
          destArray[i + 15] = sourceArray[i + 15];
          destArray[i + 16] = sourceArray[i + 16];
          destArray[i + 17] = sourceArray[i + 17];
          destArray[i + 18] = sourceArray[i + 18] - texWidth;
          destArray[i + 19] = sourceArray[i + 19] + texWidth;
          destArray[i + 20] = sourceArray[i + 20];
          destArray[i + 21] = sourceArray[i + 21];
          destArray[i + 22] = sourceArray[i + 22];
          destArray[i + 23] = sourceArray[i + 23];
          destArray[i + 24] = sourceArray[i + 24];
          destArray[i + 25] = sourceArray[i + 25];
          destArray[i + 26] = sourceArray[i + 26] - texWidth;
          destArray[i + 27] = sourceArray[i + 27] + texWidth;
          destArray[i + 28] = sourceArray[i + 28];
          destArray[i + 29] = sourceArray[i + 29];
          destArray[i + 30] = sourceArray[i + 30];
          destArray[i + 31] = sourceArray[i + 31];
          destArray[i + 32] = sourceArray[i + 32];
          destArray[i + 33] = sourceArray[i + 33];
          destArray[i + 34] = sourceArray[i + 34] + texWidth;
          destArray[i + 35] = sourceArray[i + 35] - texWidth;
          destArray[i + 36] = sourceArray[i + 36];
          destArray[i + 37] = sourceArray[i + 37];
          destArray[i + 38] = sourceArray[i + 38];
          destArray[i + 39] = sourceArray[i + 39];
          destArray[i + 40] = sourceArray[i + 40];
          destArray[i + 41] = sourceArray[i + 41];
          destArray[i + 42] = sourceArray[i + 42] - texWidth;
          destArray[i + 43] = sourceArray[i + 43] - texWidth;
          destArray[i + 44] = sourceArray[i + 44];
          destArray[i + 45] = sourceArray[i + 45];
          destArray[i + 46] = sourceArray[i + 46];
          destArray[i + 47] = sourceArray[i + 47];
          piecesSinceLastCheck++;
          piecesComplete++;
          if (piecesSinceLastCheck >= pieceLimitToRecalcTime) {
            piecesSinceLastCheck = 0;
            await sleepIfUsedTooMuchTime();
            if (gamefile2.mesh.terminate) return;
            if (main2.gforceCalc()) {
              pieceLimitToRecalcTime = Infinity;
              main2.sforceCalc(false);
            }
          }
        }
      }
      async function sleepIfUsedTooMuchTime() {
        if (!usedTooMuchTime()) return;
        const percentComplete = piecesComplete / totalPieceCount;
        stats.updateRotateMesh(percentComplete);
        await main2.sleep(0);
        startTime = performance.now();
        timeToStop = startTime + loadbalancer2.getLongTaskTime();
      }
      function usedTooMuchTime() {
        return performance.now() >= timeToStop;
      }
      stats.hideRotateMesh();
      gamefile2.mesh.rotatedModel = gamefile2.mesh.usingColoredTextures ? buffermodel.createModel_ColorTextured(gamefile2.mesh.rotatedData32, 2, "TRIANGLES", pieces.getSpritesheet()) : buffermodel.createModel_Textured(gamefile2.mesh.rotatedData32, 2, "TRIANGLES", pieces.getSpritesheet());
      gamefile2.mesh.locked--;
      gamefile2.mesh.isGenerating--;
      main2.renderThisFrame();
    },
    /**
     * Erases the 180°-rotated mesh of the game. Call when exiting perspective mode.
     * @param {gamefile} gamefile - The gamefile
     */
    eraseRotatedModel(gamefile2) {
      if (gamefile2?.mesh == null) return;
      delete gamefile2.mesh.rotatedData64;
      delete gamefile2.mesh.rotatedData32;
      delete gamefile2.mesh.rotatedModel;
    }
  };

  // src/client/scripts/game/rendering/options.mjs
  var options2 = function() {
    let debugMode = false;
    let navigationVisible = true;
    let theme = "default";
    const validThemes = ["default", "halloween", "thanksgiving", "christmas"];
    const themes = {
      default: {
        // White/Grey
        whiteTiles: [1, 1, 1, 1],
        // RGBA
        darkTiles: [0.78, 0.78, 0.78, 1],
        // Sandstone Color
        // whiteTiles: [239/255,225/255,199/255,1],
        // darkTiles: [188/255,160/255,136/255,1],
        // Wood Color
        // whiteTiles: [246/255,207/255,167/255,1],
        // darkTiles: [197/255,141/255,88/255,1],
        selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
        // selectedPieceHighlightColor: [1, 1, 0,  0.25], // Yellow (for wood theme)
        legalMovesHighlightColor_Friendly: [0, 0, 1, 0.3],
        // legalMovesHighlightColor_Friendly: [1, 0.4, 0,  0.35], // Orange (for sandstone theme)
        // legalMovesHighlightColor_Friendly: [1, 0.2, 0,  0.4], // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
        legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
        legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
        lastMoveHighlightColor: [0, 1, 0, 0.25],
        // 0.17
        // lastMoveHighlightColor: [0.3, 1, 0,  0.35], // For sandstone theme   0.3 for small, 0.35 for BIG positions
        checkHighlightColor: [1, 0, 0, 0.7],
        // If this is true, we will render them white,
        // utilizing the more efficient color-less shader program!
        useColoredPieces: false,
        whitePiecesColor: [1, 1, 1, 1],
        blackPiecesColor: [1, 1, 1, 1],
        neutralPiecesColor: [1, 1, 1, 1]
      },
      halloween: {
        whiteTiles: [1, 0.65, 0.4, 1],
        // RGBA
        darkTiles: [1, 0.4, 0, 1],
        selectedPieceHighlightColor: [0, 0, 0, 0.5],
        legalMovesHighlightColor_Friendly: [0.6, 0, 1, 0.55],
        legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
        legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
        lastMoveHighlightColor: [0.5, 0.2, 0, 0.75],
        checkHighlightColor: [1, 0, 0.5, 0.76],
        useColoredPieces: true,
        whitePiecesColor: [0.6, 0.5, 0.45, 1],
        blackPiecesColor: [0.8, 0, 1, 1],
        neutralPiecesColor: [1, 1, 1, 1]
      },
      thanksgiving: {
        // Sandstone Color
        whiteTiles: [239 / 255, 225 / 255, 199 / 255, 1],
        darkTiles: [188 / 255, 160 / 255, 136 / 255, 1],
        selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
        legalMovesHighlightColor_Friendly: [1, 0.2, 0, 0.35],
        // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
        legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
        legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
        lastMoveHighlightColor: [0.3, 1, 0, 0.35],
        // For sandstone theme   0.3 for small, 0.35 for BIG positions
        checkHighlightColor: [1, 0, 0, 0.7],
        useColoredPieces: false,
        whitePiecesColor: [1, 1, 1, 1],
        blackPiecesColor: [1, 1, 1, 1],
        neutralPiecesColor: [1, 1, 1, 1]
      },
      christmas: {
        // Sandstone Color
        whiteTiles: [152 / 255, 238 / 255, 255 / 255, 1],
        darkTiles: [0 / 255, 199 / 255, 238 / 255, 1],
        selectedPieceHighlightColor: [0, 0.5, 0.5, 0.3],
        legalMovesHighlightColor_Friendly: [0, 0, 1, 0.35],
        // Red-orange (for wood theme)   0.5 for BIG positions   0.35 for SMALL
        legalMovesHighlightColor_Opponent: [1, 0.7, 0, 0.35],
        legalMovesHighlightColor_Premove: [0.25, 0, 0.7, 0.3],
        lastMoveHighlightColor: [0, 0, 0.3, 0.35],
        // For sandstone theme   0.3 for small, 0.35 for BIG positions
        checkHighlightColor: [1, 0, 0, 0.7],
        useColoredPieces: true,
        whitePiecesColor: [0.4, 1, 0.4, 1],
        blackPiecesColor: [1, 0.2, 0.2, 1],
        neutralPiecesColor: [1, 1, 1, 1]
      }
    };
    let em = false;
    let fps = false;
    function isDebugModeOn() {
      return debugMode;
    }
    function gnavigationVisible() {
      return navigationVisible;
    }
    function gtheme() {
      return theme;
    }
    function toggleDeveloperMode() {
      main2.renderThisFrame();
      debugMode = !debugMode;
      camera2.onPositionChange();
      perspective2.initCrosshairModel();
      piecesmodel.regenModel(game.getGamefile(), getPieceRegenColorArgs());
      statustext2.showStatus(`${translations["rendering"]["toggled_debug"]} ` + (debugMode ? translations["rendering"]["on"] : translations["rendering"]["off"]));
    }
    function disableEM() {
      em = false;
    }
    function getEM() {
      return em;
    }
    function isFPSOn() {
      return fps;
    }
    function toggleEM() {
      const legalInPrivate = onlinegame2.areInOnlineGame() && onlinegame2.getIsPrivate() && input2.isKeyHeld("0");
      if (onlinegame2.areInOnlineGame() && !legalInPrivate) return;
      main2.renderThisFrame();
      em = !em;
      statustext2.showStatus(`${translations["rendering"]["toggled_edit"]} ` + (em ? translations["rendering"]["on"] : translations["rendering"]["off"]));
    }
    function setNavigationBar(value) {
      navigationVisible = value;
      onToggleNavigationBar();
    }
    function toggleNavigationBar() {
      if (!game.getGamefile()) return;
      navigationVisible = !navigationVisible;
      onToggleNavigationBar();
    }
    function onToggleNavigationBar() {
      if (navigationVisible) {
        guinavigation.open();
        guigameinfo.open();
      } else guinavigation.close();
      camera2.updatePIXEL_HEIGHT_OF_NAVS();
    }
    function getDefaultTiles(isWhite) {
      if (isWhite) return themes[theme].whiteTiles;
      else return themes[theme].darkTiles;
    }
    function getLegalMoveHighlightColor({ isOpponentPiece = selection2.isOpponentPieceSelected(), isPremove = selection2.arePremoving() } = {}) {
      if (isOpponentPiece) return themes[theme].legalMovesHighlightColor_Opponent;
      else if (isPremove) return themes[theme].legalMovesHighlightColor_Premove;
      else return themes[theme].legalMovesHighlightColor_Friendly;
    }
    function getDefaultSelectedPieceHighlight() {
      return themes[theme].selectedPieceHighlightColor;
    }
    function getDefaultLastMoveHighlightColor() {
      return themes[theme].lastMoveHighlightColor;
    }
    function getDefaultCheckHighlightColor() {
      return themes[theme].checkHighlightColor;
    }
    function setTheme(newTheme) {
      if (!validateTheme(theme)) console.error(`Cannot change theme to invalid theme ${theme}!`);
      theme = newTheme;
      board2.updateTheme();
      piecesmodel.regenModel(game.getGamefile(), getPieceRegenColorArgs());
      highlights.regenModel();
    }
    function toggleChristmasTheme() {
      if (theme === "christmas") setTheme("default");
      else if (theme === "default") setTheme("christmas");
    }
    function validateTheme(theme2) {
      return validThemes.includes(theme2);
    }
    function getPieceRegenColorArgs() {
      if (!themes[theme].useColoredPieces) return;
      return {
        white: themes[theme].whitePiecesColor,
        // [r,g,b,a]
        black: themes[theme].blackPiecesColor,
        neutral: themes[theme].neutralPiecesColor
      };
    }
    function getColorOfType(type) {
      const colorArgs = getPieceRegenColorArgs();
      if (!colorArgs) return { r: 1, g: 1, b: 1, a: 1 };
      const pieceColor = math2.getPieceColorFromType(type);
      const color = colorArgs[pieceColor];
      return {
        r: color[0],
        g: color[1],
        b: color[2],
        a: color[3]
      };
    }
    function areUsingColoredPieces() {
      return themes[theme].useColoredPieces;
    }
    function toggleFPS() {
      fps = !fps;
      if (fps) stats.showFPS();
      else stats.hideFPS();
    }
    function isThemeDefault() {
      return theme === "default";
    }
    return Object.freeze({
      isDebugModeOn,
      gnavigationVisible,
      setNavigationBar,
      gtheme,
      themes,
      toggleDeveloperMode,
      toggleEM,
      toggleNavigationBar,
      getDefaultTiles,
      getLegalMoveHighlightColor,
      getDefaultSelectedPieceHighlight,
      getDefaultLastMoveHighlightColor,
      getDefaultCheckHighlightColor,
      setTheme,
      toggleChristmasTheme,
      getPieceRegenColorArgs,
      getColorOfType,
      areUsingColoredPieces,
      getEM,
      toggleFPS,
      isThemeDefault,
      disableEM,
      isFPSOn
    });
  }();

  // src/client/scripts/game/rendering/checkhighlight.mjs
  var checkhighlight = function() {
    function render() {
      if (!game2.getGamefile().inCheck) return;
      const royalsInCheck = game2.getGamefile().inCheck;
      const model = genCheckHighlightModel(royalsInCheck);
      model.render();
    }
    function genCheckHighlightModel(royalsInCheck) {
      const z = -5e-3;
      const color = options2.getDefaultCheckHighlightColor();
      const data = [];
      for (let i = 0; i < royalsInCheck.length; i++) {
        const thisRoyalInCheckCoords = royalsInCheck[i];
        const worldSpaceCoord = math2.convertCoordToWorldSpace(thisRoyalInCheckCoords);
        const x = worldSpaceCoord[0];
        const y = worldSpaceCoord[1];
        const outRad = 0.65 * movement.getBoardScale();
        const inRad = 0.3 * movement.getBoardScale();
        const resolution = 20;
        const dataCircle = bufferdata.getDataCircle3D(x, y, z, inRad, resolution, ...color);
        const dataRing = bufferdata.getDataRing3D(x, y, z, inRad, outRad, resolution, ...color, color[0], color[1], color[2], 0);
        data.push(...dataCircle);
        data.push(...dataRing);
      }
      return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
    }
    return Object.freeze({
      render
    });
  }();

  // src/client/scripts/game/chess/organizedlines.mjs
  var organizedlines2 = {
    /**
     * Organizes all the pieces of the specified game into many different lists,
     * organized in different ways. For example, organized by key `'1,2'`,
     * or by type `'queensW'`, or by row/column/diagonal.
     * 
     * These are helpful because they vastly improve performance. For instance,
     * if we know the coordinates of a piece, we don't have to iterate
     * through the entire list of pieces to find its type.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} [options] - An object that may contain the `appendUndefineds` option. If false, no undefined *null* placeholder pieces will be left for the mesh generation. Defaults to *true*. Set to false if you're planning on regenerating manually.
     */
    initOrganizedPieceLists: function(gamefile2, { appendUndefineds = true } = {}) {
      if (!gamefile2.ourPieces) return console.error("Cannot init the organized lines before ourPieces is defined.");
      organizedlines2.resetOrganizedLists(gamefile2);
      gamefileutility2.forEachPieceInGame(gamefile2, organizedlines2.organizePiece);
      organizedlines2.initUndefineds(gamefile2);
      if (appendUndefineds) organizedlines2.appendUndefineds(gamefile2);
    },
    resetOrganizedLists: function(gamefile2) {
      gamefile2.piecesOrganizedByKey = {};
      gamefile2.piecesOrganizedByLines = {};
      const lines = gamefile2.startSnapshot.slidingPossible;
      for (let i = 0; i < lines.length; i++) {
        gamefile2.piecesOrganizedByLines[math2.getKeyFromCoords(lines[i])] = {};
      }
    },
    // Inserts given piece into all the organized piece lists (key, row, column...)
    organizePiece: function(type, coords, gamefile2) {
      if (!coords) return;
      const piece = { type, coords };
      let key = math2.getKeyFromCoords(coords);
      if (gamefile2.piecesOrganizedByKey[key]) throw new Error(`While organizing a piece, there was already an existing piece there!! ${coords}`);
      gamefile2.piecesOrganizedByKey[key] = type;
      const lines = gamefile2.startSnapshot.slidingPossible;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        key = organizedlines2.getKeyFromLine(line, coords);
        const strline = math2.getKeyFromCoords(line);
        if (!gamefile2.piecesOrganizedByLines[strline][key]) gamefile2.piecesOrganizedByLines[strline][key] = [];
        gamefile2.piecesOrganizedByLines[strline][key].push(piece);
      }
    },
    // Remove specified piece from all the organized piece lists (piecesOrganizedByKey, etc.)
    removeOrganizedPiece: function(gamefile2, coords) {
      let key = math2.getKeyFromCoords(coords);
      if (!gamefile2.piecesOrganizedByKey[key]) throw new Error(`No organized piece at coords ${coords} to delete!`);
      delete gamefile2.piecesOrganizedByKey[key];
      const lines = gamefile2.startSnapshot.slidingPossible;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        key = organizedlines2.getKeyFromLine(line, coords);
        removePieceFromLine(gamefile2.piecesOrganizedByLines[line], key);
      }
      function removePieceFromLine(organizedPieces, lineKey) {
        const line = organizedPieces[lineKey];
        for (let i = 0; i < line.length; i++) {
          const thisPieceCoords = line[i].coords;
          if (thisPieceCoords[0] === coords[0] && thisPieceCoords[1] === coords[1]) {
            line.splice(i, 1);
            if (line.length === 0) delete organizedPieces[lineKey];
            break;
          }
        }
      }
    },
    initUndefineds: function(gamefile2) {
      pieces.forEachPieceType(init);
      function init(listType) {
        const list = gamefile2.ourPieces[listType];
        list.undefineds = [];
      }
    },
    /**
     * Adds more undefined placeholders, or *null* pieces, into the piece lists,
     * to allocate more space in the mesh of all the pieces.
     * Only called within `initOrganizedPieceLists()` because this assumes
     * each piece list has zero, so it adds the exact same amount to each list.
     * These placeholders are used up when pawns promote.
     * @param {gamefile} gamefile - The gamefile
     */
    appendUndefineds: function(gamefile2) {
      pieces.forEachPieceType(append);
      function append(listType) {
        if (!organizedlines2.isTypeATypeWereAppendingUndefineds(gamefile2, listType)) return;
        const list = gamefile2.ourPieces[listType];
        for (let i = 0; i < pieces.extraUndefineds; i++) organizedlines2.insertUndefinedIntoList(list);
      }
    },
    areWeShortOnUndefineds: function(gamefile2) {
      let weShort = false;
      pieces.forEachPieceType(areWeShort);
      function areWeShort(listType) {
        if (!organizedlines2.isTypeATypeWereAppendingUndefineds(gamefile2, listType)) return;
        const list = gamefile2.ourPieces[listType];
        const undefinedCount = list.undefineds.length;
        if (undefinedCount === 0) weShort = true;
      }
      return weShort;
    },
    /**
     * Adds more undefined placeholders, or *null* pieces, into the piece lists,
     * to allocate more space in the mesh of all the pieces, then regenerates the mesh.
     * Makes sure each piece list has the bare minimum number of undefineds.
     * These placeholders are used up when pawns promote.
     * When they're gone, we have to regenerate the mesh, with more empty placeholders.
     * @param {gamefile} gamefile - The gamefile
     * @param {Object} options - An object containing the various properties:
     * - `regenModel`: Whether to renegerate the model of all the pieces afterward. Default: *true*.
     * - `log`: Whether to log to the console that we're adding more undefineds. Default: *false*
     */
    addMoreUndefineds: function(gamefile2, { regenModel = true, log = false } = {}) {
      if (log) console.log("Adding more placeholder undefined pieces.");
      pieces.forEachPieceType(add);
      function add(listType) {
        if (!organizedlines2.isTypeATypeWereAppendingUndefineds(gamefile2, listType)) return;
        const list = gamefile2.ourPieces[listType];
        const undefinedCount = list.undefineds.length;
        for (let i = undefinedCount; i < pieces.extraUndefineds; i++) organizedlines2.insertUndefinedIntoList(list);
      }
      if (regenModel) piecesmodel.regenModel(gamefile2, options.getPieceRegenColorArgs());
    },
    /**
     * Sees if the provided type is a type we need to append undefined
     * placeholders to the piece list of this type.
     * The mesh of all the pieces needs placeholders in case we
     * promote to a new piece.
     * @param {gamefile} gamefile - The gamefile
     * @param {string} type - The type of piece (e.g. "pawnsW")
     * @returns {boolean} *true* if we need to append placeholders for this type.
     */
    isTypeATypeWereAppendingUndefineds(gamefile2, type) {
      if (!gamefile2.gameRules.promotionsAllowed) throw new Error("promotionsAllowed needs to be defined before appending undefineds to the piece lists!");
      const color = math2.getPieceColorFromType(type);
      if (!gamefile2.gameRules.promotionsAllowed[color]) return false;
      const trimmedType = math2.trimWorBFromType(type);
      return gamefile2.gameRules.promotionsAllowed[color].includes(trimmedType);
    },
    insertUndefinedIntoList: function(list) {
      const insertedIndex = list.push(void 0) - 1;
      list.undefineds.push(insertedIndex);
    },
    buildKeyListFromState: function(state) {
      const keyList = {};
      gamefileutility2.forEachPieceInPiecesByType(callback, state);
      function callback(type, coords) {
        const key = math2.getKeyFromCoords(coords);
        keyList[key] = type;
      }
      return keyList;
    },
    /**
     * Converts a piece list organized by key to organized by type.
     * @param {Object} keyList - Pieces organized by key: `{ '1,2': 'pawnsW' }`
     * @returns {Object} Pieces organized by type: `{ pawnsW: [ [1,2], [2,2], ...]}`
     */
    buildStateFromKeyList: function(keyList) {
      const state = organizedlines2.getEmptyTypeState();
      for (const key in keyList) {
        const type = keyList[key];
        const coords = math2.getCoordsFromKey(key);
        if (!state[type]) return console.error(`Error when building state from key list. Type ${type} is undefined!`);
        state[type].push(coords);
      }
      return state;
    },
    getEmptyTypeState() {
      const state = {};
      for (let i = 0; i < pieces.white.length; i++) {
        state[pieces.white[i]] = [];
        state[pieces.black[i]] = [];
      }
      for (let i = 0; i < pieces.neutral.length; i++) {
        state[pieces.neutral[i]] = [];
      }
      return state;
    },
    /**
     * Returns a string that is a unique identifier of a given organized line: `"C|X"`.
     * Where `C` is the c in the linear standard form of the line: "ax + by = c",
     * and `X` is the nearest x-value the line intersects on or after the y-axis.
     * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
     * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
     * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
     * 
     * If the line is perfectly vertical, the axis will be flipped, so `X` in this
     * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
     * @param {Number[]} step - Line step `[dx,dy]`
     * @param {Number[]} coords `[x,y]` - A point the line intersects
     * @returns {String} the key `C|X`
     */
    getKeyFromLine(step, coords) {
      const C = organizedlines2.getCFromLine(step, coords);
      const X = organizedlines2.getXFromLine(step, coords);
      return `${C}|${X}`;
    },
    /**
     * Calculates the `C` value in the linear standard form of the line: "ax + by = c".
     * Step size here is unimportant, but the slope **is**.
     * This value will be unique for every line that *has the same slope*, but different positions.
     * @param {number[]} step - The x-step and y-step of the line: `[deltax, deltay]`
     * @param {number[]} coords - A point the line intersects: `[x,y]`
     * @returns {number} The C in the line's key: `C|X`
     */
    getCFromLine(step, coords) {
      return step[0] * coords[1] - step[1] * coords[0];
    },
    /**
     * Calculates the `X` value of the line's key from the provided step direction and coordinates,
     * which is the nearest x-value the line intersects on or after the y-axis.
     * For example, the line with step-size [2,0] that starts on point (0,0) will have an X value of '0',
     * whereas the line with step-size [2,0] that starts on point (1,0) will have an X value of '1',
     * because it's step size means it never intersects the y-axis at x = 0, but x = 1 is the nearest it gets to it, after 0.
     * 
     * If the line is perfectly vertical, the axis will be flipped, so `X` in this
     * situation would be the nearest **Y**-value the line intersects on or above the x-axis.
     * @param {number[]} step - [dx,dy]
     * @param {number[]} coords - Coordinates that are on the line
     * @returns {number} The X in the line's key: `C|X`
     */
    getXFromLine(step, coords) {
      const lineIsVertical = step[0] === 0;
      const deltaAxis = lineIsVertical ? step[1] : step[0];
      const coordAxis = lineIsVertical ? coords[1] : coords[0];
      return math2.posMod(coordAxis, deltaAxis);
    },
    /**
     * Tests if the provided gamefile has colinear organized lines present in the game.
     * This can occur if there are sliders that can move in the same exact direction as others.
     * For example, [2,0] and [3,0]. We typically like to know this information because
     * we want to avoid having trouble with calculating legal moves surrounding discovered attacks
     * by using royalcapture instead of checkmate.
     * @param {gamefile} gamefile 
     */
    areColinearSlidesPresentInGame(gamefile2) {
      const slidingPossible = gamefile2.startSnapshot.slidingPossible;
      for (let a = 0; a < slidingPossible.length - 1; a++) {
        const line1 = slidingPossible[a];
        const slope1 = line1[1] / line1[0];
        const line1IsVertical = isNaN(slope1);
        for (let b = a + 1; b < slidingPossible.length; b++) {
          const line2 = slidingPossible[b];
          const slope2 = line2[1] / line2[0];
          const line2IsVertical = isNaN(slope2);
          if (line1IsVertical && line2IsVertical) return true;
          if (slope1 === slope2) return true;
        }
      }
      return false;
    }
  };

  // src/client/scripts/game/rendering/arrows.mjs
  var arrows = function() {
    const width = 0.65;
    const sidePadding = 0.15;
    const opacity = 0.6;
    const renderZoomLimit = 10;
    const perspectiveDist = 17;
    let data;
    let model;
    let dataArrows = void 0;
    let modelArrows = void 0;
    let mode = 1;
    let hovering = false;
    let piecesHoveredOver = {};
    function getMode() {
      return mode;
    }
    function setMode(value) {
      mode = value;
      if (mode === 0) piecesHoveredOver = {};
    }
    function isMouseHovering() {
      return hovering;
    }
    function update() {
      if (mode === 0) return;
      model = void 0;
      const scaleWhenAtLimit = camera2.getScreenBoundingBox(false).right * 2 / camera2.canvas.width * camera2.getPixelDensity() * renderZoomLimit;
      if (movement.getBoardScale() < scaleWhenAtLimit) return;
      modelArrows = void 0;
      data = [];
      dataArrows = [];
      hovering = false;
      const boundingBox = perspective2.getEnabled() ? math2.generatePerspectiveBoundingBox(perspectiveDist + 1) : board2.gboundingBox();
      const boundingBoxFloat = perspective2.getEnabled() ? math2.generatePerspectiveBoundingBox(perspectiveDist) : board2.gboundingBoxFloat();
      const slideArrows = {};
      let headerPad = perspective2.getEnabled() ? 0 : math2.convertPixelsToWorldSpace_Virtual(camera2.getPIXEL_HEIGHT_OF_TOP_NAV());
      let footerPad = perspective2.getEnabled() ? 0 : math2.convertPixelsToWorldSpace_Virtual(camera2.getPIXEL_HEIGHT_OF_BOTTOM_NAV());
      if (perspective2.getIsViewingBlackPerspective() && !perspective2.getEnabled()) {
        const a = headerPad;
        headerPad = footerPad;
        footerPad = a;
      }
      const paddedBoundingBox = math2.deepCopyObject(boundingBoxFloat);
      if (!perspective2.getEnabled()) {
        paddedBoundingBox.top -= math2.convertWorldSpaceToGrid(headerPad);
        paddedBoundingBox.bottom += math2.convertWorldSpaceToGrid(footerPad);
      }
      const gamefile2 = game2.getGamefile();
      const slides = gamefile2.startSnapshot.slidingPossible;
      for (const line of slides) {
        const perpendicular = [-line[1], line[0]];
        const linestr = math2.getKeyFromCoords(line);
        let boardCornerLeft = math2.getAABBCornerOfLine(perpendicular, true);
        let boardCornerRight = math2.getAABBCornerOfLine(perpendicular, false);
        boardCornerLeft = math2.getCornerOfBoundingBox(paddedBoundingBox, boardCornerLeft);
        boardCornerRight = math2.getCornerOfBoundingBox(paddedBoundingBox, boardCornerRight);
        const boardSlidesRight = organizedlines2.getCFromLine(line, boardCornerLeft);
        const boardSlidesLeft = organizedlines2.getCFromLine(line, boardCornerRight);
        const boardSlidesStart = Math.min(boardSlidesLeft, boardSlidesRight);
        const boardSlidesEnd = Math.max(boardSlidesLeft, boardSlidesRight);
        for (const key in gamefile2.piecesOrganizedByLines[linestr]) {
          const intsects = key.split("|").map(Number);
          if (boardSlidesStart > intsects[0] || boardSlidesEnd < intsects[0]) continue;
          const pieces2 = calcPiecesOffScreen(line, gamefile2.piecesOrganizedByLines[linestr][key]);
          if (math2.isEmpty(pieces2)) continue;
          if (!slideArrows[linestr]) slideArrows[linestr] = {};
          slideArrows[linestr][key] = pieces2;
        }
      }
      function calcPiecesOffScreen(line, organizedline) {
        const rightCorner = math2.getCornerOfBoundingBox(paddedBoundingBox, math2.getAABBCornerOfLine(line, false));
        let left;
        let right;
        for (const piece of organizedline) {
          if (!piece.coords) continue;
          if (math2.boxContainsSquare(boundingBox, piece.coords)) continue;
          const x = piece.coords[0];
          const y = piece.coords[1];
          const axis = line[0] == 0 ? 1 : 0;
          const rightSide = x > paddedBoundingBox.right || y > rightCorner[1] == (rightCorner[1] == paddedBoundingBox.top);
          if (rightSide) {
            if (!right) right = piece;
            else if (piece.coords[axis] < right.coords[axis]) right = piece;
          } else {
            if (!left) left = piece;
            else if (piece.coords[axis] > left.coords[axis]) left = piece;
          }
        }
        const dirs = {};
        if (right) dirs["r"] = right;
        if (left) dirs["l"] = left;
        return dirs;
      }
      removeUnnecessaryArrows(slideArrows);
      const boardScale = movement.getBoardScale();
      const worldWidth = width * boardScale;
      let padding = worldWidth / 2 + sidePadding * boardScale;
      const cpadding = padding / boardScale;
      {
        paddedBoundingBox.top -= cpadding;
        paddedBoundingBox.right -= cpadding;
        paddedBoundingBox.bottom += cpadding;
        paddedBoundingBox.left += cpadding;
      }
      const piecesHoveringOverThisFrame = [];
      if (perspective2.getEnabled()) padding = 0;
      for (const strline in slideArrows) {
        const line = math2.getCoordsFromKey(strline);
        iterateThroughDiagLine(slideArrows[strline], line);
      }
      function iterateThroughDiagLine(lines, direction) {
        for (const diag in lines) {
          for (const side in lines[diag]) {
            const piece = lines[diag][side];
            const intersect = Number(diag.split("|")[0]);
            if (piece.type === "voidsN") continue;
            const isLeft = side === "l";
            const corner = math2.getAABBCornerOfLine(direction, isLeft);
            const renderCoords = math2.getLineIntersectionEntryTile(direction[0], direction[1], intersect, paddedBoundingBox, corner);
            if (!renderCoords) continue;
            const arrowDirection = isLeft ? [-direction[0], -direction[1]] : direction;
            concatData(renderCoords, piece.type, corner, worldWidth, 0, piece.coords, arrowDirection, piecesHoveringOverThisFrame);
          }
        }
      }
      if (!movesscript2.areWeViewingLatestMove(gamefile2)) piecesHoveringOverThisFrame.length = 0;
      const piecesHoveringOverThisFrame_Keys = piecesHoveringOverThisFrame.map((rider) => math2.getKeyFromCoords(rider.coords));
      for (const key of Object.keys(piecesHoveredOver)) {
        if (piecesHoveringOverThisFrame_Keys.includes(key)) continue;
        delete piecesHoveredOver[key];
      }
      if (data.length === 0) return;
      for (const pieceHovered of piecesHoveringOverThisFrame) {
        onPieceIndicatorHover(pieceHovered.type, pieceHovered.coords, pieceHovered.dir);
      }
      model = buffermodel.createModel_ColorTextured(new Float32Array(data), 2, "TRIANGLES", pieces.getSpritesheet());
      modelArrows = buffermodel.createModel_Colored(new Float32Array(dataArrows), 2, "TRIANGLES");
    }
    function removeUnnecessaryArrows(arrows2) {
      if (mode === 0) return;
      const gamefile2 = game2.getGamefile();
      let attacklines = [];
      attack: {
        if (mode !== 2) break attack;
        const piece = selection2.getPieceSelected();
        if (!piece) break attack;
        const slidingMoveset = legalmoves.getPieceMoveset(gamefile2, piece.type).sliding;
        if (!slidingMoveset) break attack;
        attacklines = Object.keys(slidingMoveset);
      }
      for (const strline in arrows2) {
        if (attacklines.includes(strline)) continue;
        removeTypesWithIncorrectMoveset(arrows2[strline], strline);
        if (math2.isEmpty(arrows2[strline])) delete arrows2[strline];
      }
      function removeTypesWithIncorrectMoveset(object, direction) {
        for (const key in object) {
          for (const side in object[key]) {
            const type = object[key][side].type;
            if (!doesTypeHaveMoveset(gamefile2, type, direction)) delete object[key][side];
          }
          if (math2.isEmpty(object[key])) delete object[key];
        }
      }
      function doesTypeHaveMoveset(gamefile3, type, direction) {
        const moveset = legalmoves.getPieceMoveset(gamefile3, type);
        if (!moveset.sliding) return false;
        return moveset.sliding[direction] != null;
      }
    }
    function concatData(renderCoords, type, paddingDir, worldWidth, padding, pieceCoords, direction, piecesHoveringOverThisFrame) {
      const worldHalfWidth = worldWidth / 2;
      const worldCoords = math2.convertCoordToWorldSpace(renderCoords);
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation);
      const xPad = paddingDir.includes("right") ? -padding : paddingDir.includes("left") ? padding : 0;
      const yPad = paddingDir.includes("top") ? -padding : paddingDir.includes("bottom") ? padding : 0;
      worldCoords[0] += xPad;
      worldCoords[1] += yPad;
      const startX = worldCoords[0] - worldHalfWidth;
      const startY = worldCoords[1] - worldHalfWidth;
      const endX = startX + worldWidth;
      const endY = startY + worldWidth;
      const { r, g, b } = options2.getColorOfType(type);
      let thisOpacity = opacity;
      const mouseWorldLocation = input2.getMouseWorldLocation();
      const mouseWorldX = input2.getTouchClickedWorld() ? input2.getTouchClickedWorld()[0] : mouseWorldLocation[0];
      const mouseWorldY = input2.getTouchClickedWorld() ? input2.getTouchClickedWorld()[1] : mouseWorldLocation[1];
      if (mouseWorldX > startX && mouseWorldX < endX && mouseWorldY > startY && mouseWorldY < endY) {
        piecesHoveringOverThisFrame.push({ type, coords: pieceCoords, dir: direction });
        thisOpacity = 1;
        hovering = true;
        if (input2.isMouseDown_Left() || input2.getTouchClicked()) {
          const startCoords = movement.getBoardPos();
          let telCoords;
          if (paddingDir === "right" || paddingDir === "left") telCoords = [pieceCoords[0], startCoords[1]];
          else if (paddingDir === "top" || paddingDir === "bottom") telCoords = [startCoords[0], pieceCoords[1]];
          else telCoords = [pieceCoords[0], pieceCoords[1]];
          transition2.panTel(startCoords, telCoords);
          if (input2.isMouseDown_Left()) input2.removeMouseDown_Left();
        }
      }
      const thisData = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, thisOpacity);
      data.push(...thisData);
      const dist = worldHalfWidth * 1;
      const size = 0.3 * worldHalfWidth;
      const points = [
        [dist, -size],
        [dist, +size],
        [dist + size, 0]
      ];
      const angle = Math.atan2(direction[1], direction[0]);
      const ad = applyTransform(points, angle, worldCoords);
      for (let i = 0; i < ad.length; i++) {
        const thisPoint = ad[i];
        dataArrows.push(thisPoint[0], thisPoint[1], 0, 0, 0, thisOpacity);
      }
    }
    function applyTransform(points, rotation, translation) {
      const transformedPoints = points.map((point) => {
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        const xRot = point[0] * cos - point[1] * sin;
        const yRot = point[0] * sin + point[1] * cos;
        const xTrans = xRot + translation[0];
        const yTrans = yRot + translation[1];
        return [xTrans, yTrans];
      });
      return transformedPoints;
    }
    function renderThem() {
      if (mode === 0) return;
      if (model == null) return;
      model.render();
      modelArrows.render();
    }
    function onPieceIndicatorHover(type, pieceCoords, direction) {
      const key = math2.getKeyFromCoords(pieceCoords);
      if (key in piecesHoveredOver) return;
      const gamefile2 = game2.getGamefile();
      const thisRider = gamefileutility2.getPieceAtCoords(gamefile2, pieceCoords);
      const thisPieceLegalMoves = legalmoves.calculate(gamefile2, thisRider);
      const data2 = [];
      const pieceColor = math2.getPieceColorFromType(type);
      const opponentColor = onlinegame2.areInOnlineGame() ? math2.getOppositeColor(onlinegame2.getOurColor()) : math2.getOppositeColor(gamefile2.whosTurn);
      const isOpponentPiece = pieceColor === opponentColor;
      const isOurTurn = gamefile2.whosTurn === pieceColor;
      const color = options2.getLegalMoveHighlightColor({ isOpponentPiece, isPremove: !isOurTurn });
      highlights.concatData_HighlightedMoves_Individual(data2, thisPieceLegalMoves, color);
      highlights.concatData_HighlightedMoves_Sliding(data2, pieceCoords, thisPieceLegalMoves, color);
      const model2 = buffermodel.createModel_Colored(new Float32Array(data2), 3, "TRIANGLES");
      piecesHoveredOver[key] = { legalMoves: thisPieceLegalMoves, model: model2, color };
    }
    function doesTypeHaveDirection(type, direction) {
      const moveset = legalmoves.getPieceMoveset(game2.getGamefile(), type);
      if (!moveset.sliding) return false;
      const absoluteDirection = absoluteValueOfDirection(direction);
      const key = math2.getKeyFromCoords(absoluteDirection);
      return key in moveset.sliding;
    }
    function absoluteValueOfDirection(direction) {
      let [dx, dy] = direction;
      if (dx < 0 || dx === 0 && dy < 0) {
        dx *= -1;
        dy *= -1;
      }
      return [dx, dy];
    }
    function renderEachHoveredPiece() {
      const boardPos = movement.getBoardPos();
      const model_Offset = highlights.getOffset();
      const position = [
        -boardPos[0] + model_Offset[0],
        // Add the highlights offset
        -boardPos[1] + model_Offset[1],
        0
      ];
      const boardScale = movement.getBoardScale();
      const scale = [boardScale, boardScale, 1];
      for (const [key, value] of Object.entries(piecesHoveredOver)) {
        if (selection2.isAPieceSelected()) {
          const coords = math2.getCoordsFromKey(key);
          const pieceSelectedCoords = selection2.getPieceSelected().coords;
          if (math2.areCoordsEqual(coords, pieceSelectedCoords)) continue;
        }
        value.model.render(position, scale);
      }
    }
    function regenModelsOfHoveredPieces() {
      if (!Object.keys(piecesHoveredOver).length) return;
      console.log("Updating models of hovered piece's legal moves..");
      for (const [key, value] of Object.entries(piecesHoveredOver)) {
        const coords = math2.getCoordsFromKey(key);
        const data2 = [];
        highlights.concatData_HighlightedMoves_Sliding(data2, coords, value.legalMoves, value.color);
        value.model = buffermodel.createModel_Colored(new Float32Array(data2), 3, "TRIANGLES");
      }
    }
    function clearListOfHoveredPieces() {
      for (const hoveredPieceKey in piecesHoveredOver) {
        delete piecesHoveredOver[hoveredPieceKey];
      }
    }
    return Object.freeze({
      getMode,
      update,
      setMode,
      renderThem,
      isMouseHovering,
      renderEachHoveredPiece,
      regenModelsOfHoveredPieces,
      clearListOfHoveredPieces
    });
  }();

  // src/client/scripts/game/rendering/highlights.mjs
  var highlights = function() {
    const highlightedMovesRegenRange = 1e4;
    let boundingBoxOfRenderRange;
    const multiplier = 4;
    const multiplier_perspective = 2;
    let data;
    let model;
    let model_Offset = [0, 0];
    const z = -0.01;
    function getOffset() {
      return model_Offset;
    }
    function render() {
      if (movement.isScaleLess1Pixel_Virtual()) return;
      highlightLastMove();
      checkhighlight.render();
      updateOffsetAndBoundingBoxOfRenderRange();
      renderLegalMoves();
      arrows.renderEachHoveredPiece();
      renderBoundingBoxOfRenderRange();
    }
    function renderLegalMoves() {
      if (!selection2.isAPieceSelected()) return;
      const boardPos = movement.getBoardPos();
      const position = [
        -boardPos[0] + model_Offset[0],
        // Add the model's offset
        -boardPos[1] + model_Offset[1],
        0
      ];
      const boardScale = movement.getBoardScale();
      const scale = [boardScale, boardScale, 1];
      model.render(position, scale);
    }
    function regenModel() {
      if (!selection2.isAPieceSelected()) return;
      main2.renderThisFrame();
      console.log("Regenerating legal moves model..");
      updateOffsetAndBoundingBoxOfRenderRange();
      data = [];
      const selectedPieceHighlightData = calcHighlightData_SelectedPiece();
      data.push(...selectedPieceHighlightData);
      const coords = selection2.getPieceSelected().coords;
      const legalMoves = selection2.getLegalMovesOfSelectedPiece();
      const color = options2.getLegalMoveHighlightColor();
      concatData_HighlightedMoves_Individual(data, legalMoves, color);
      concatData_HighlightedMoves_Sliding(data, coords, legalMoves, color);
      model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
    }
    function updateOffsetAndBoundingBoxOfRenderRange() {
      let changeMade = false;
      const oldOffset = math2.deepCopyObject(model_Offset);
      model_Offset = math2.roundPointToNearestGridpoint(movement.getBoardPos(), highlightedMovesRegenRange);
      if (!math2.areCoordsEqual(oldOffset, model_Offset)) changeMade = true;
      if (isRenderRangeBoundingBoxOutOfRange()) {
        initBoundingBoxOfRenderRange();
        changeMade = true;
      }
      if (changeMade) {
        console.log("Shifted offset of highlights.");
        regenModel();
        arrows.regenModelsOfHoveredPieces();
      }
    }
    function calcHighlightData_SelectedPiece() {
      const color = options2.getDefaultSelectedPieceHighlight();
      return bufferdata.getDataQuad_Color3D_FromCoord_WithOffset(model_Offset, selection2.getPieceSelected().coords, z, color);
    }
    function concatData_HighlightedMoves_Individual(data2, legalMoves, color) {
      const theseLegalMoves = legalMoves.individual;
      const length = !theseLegalMoves ? 0 : theseLegalMoves.length;
      for (let i = 0; i < length; i++) {
        data2.push(...bufferdata.getDataQuad_Color3D_FromCoord_WithOffset(model_Offset, theseLegalMoves[i], z, color));
      }
    }
    function initBoundingBoxOfRenderRange() {
      const [newWidth, newHeight] = perspective2.getEnabled() ? getDimensionsOfPerspectiveViewRange() : getDimensionsOfOrthographicViewRange();
      const halfNewWidth = newWidth / 2;
      const halfNewHeight = newHeight / 2;
      const boardPos = movement.getBoardPos();
      const newLeft = Math.ceil(boardPos[0] - halfNewWidth);
      const newRight = Math.floor(boardPos[0] + halfNewWidth);
      const newBottom = Math.ceil(boardPos[1] - halfNewHeight);
      const newTop = Math.floor(boardPos[1] + halfNewHeight);
      boundingBoxOfRenderRange = {
        left: newLeft,
        right: newRight,
        bottom: newBottom,
        top: newTop
      };
    }
    function getDimensionsOfOrthographicViewRange() {
      const width = board2.gboundingBox().right - board2.gboundingBox().left + 1;
      const height = board2.gboundingBox().top - board2.gboundingBox().bottom + 1;
      let newWidth = width * multiplier;
      let newHeight = height * multiplier;
      const capWidth = camera2.canvas.width * multiplier;
      if (newWidth > capWidth) {
        const ratio = capWidth / newWidth;
        newWidth *= ratio;
        newHeight *= ratio;
      }
      return [newWidth, newHeight];
    }
    function getDimensionsOfPerspectiveViewRange() {
      const width = perspective2.viewRange * 2;
      const newWidth = width * multiplier_perspective;
      return [newWidth, newWidth];
    }
    function isRenderRangeBoundingBoxOutOfRange() {
      if (!boundingBoxOfRenderRange) return true;
      const boundingBoxOfView = perspective2.getEnabled() ? getBoundingBoxOfPerspectiveView() : board2.gboundingBox();
      const width = boundingBoxOfView.right - boundingBoxOfView.left + 1;
      const renderRangeWidth = boundingBoxOfRenderRange.right - boundingBoxOfRenderRange.left + 1;
      if (width * multiplier * multiplier < renderRangeWidth && !perspective2.getEnabled()) return true;
      if (!math2.boxContainsBox(boundingBoxOfRenderRange, boundingBoxOfView)) return true;
      return false;
    }
    function getBoundingBoxOfPerspectiveView() {
      const boardPos = movement.getBoardPos();
      const x = boardPos[0];
      const y = boardPos[1];
      const a = perspective2.viewRange;
      const left = x - a;
      const right = x + a;
      const bottom = y - a;
      const top = y + a;
      return { left, right, bottom, top };
    }
    function concatData_HighlightedMoves_Sliding(data2, coords, legalMoves, color) {
      if (!legalMoves.sliding) return;
      updateOffsetAndBoundingBoxOfRenderRange();
      const lineSet = new Set(Object.keys(legalMoves.sliding));
      const vertexData = bufferdata.getDataQuad_Color3D_FromCoord_WithOffset(model_Offset, coords, z, color);
      for (const strline of lineSet) {
        const line = math2.getCoordsFromKey(strline);
        const C = organizedlines2.getCFromLine(line, coords);
        const corner1 = math2.getAABBCornerOfLine(line, true);
        const corner2 = math2.getAABBCornerOfLine(line, false);
        const intsect1Tile = math2.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner1);
        const intsect2Tile = math2.getLineIntersectionEntryTile(line[0], line[1], C, boundingBoxOfRenderRange, corner2);
        if (!intsect1Tile && !intsect2Tile) continue;
        if (!intsect1Tile || !intsect2Tile) {
          console.error(`Line only has one intersect with square.`);
          continue;
        }
        concatData_HighlightedMoves_Diagonal(data2, coords, line, intsect1Tile, intsect2Tile, legalMoves.sliding[line], vertexData);
      }
    }
    function concatData_HighlightedMoves_Diagonal(data2, coords, step, intsect1Tile, intsect2Tile, limits, vertexData) {
      concatData_HighlightedMoves_Diagonal_Split(data2, coords, step, intsect1Tile, intsect2Tile, limits[1], math2.deepCopyObject(vertexData));
      const negStep = [step[0] * -1, step[1] * -1];
      concatData_HighlightedMoves_Diagonal_Split(data2, coords, negStep, intsect1Tile, intsect2Tile, Math.abs(limits[0]), math2.deepCopyObject(vertexData));
    }
    function concatData_HighlightedMoves_Diagonal_Split(data2, coords, step, intsect1Tile, intsect2Tile, limit, vertexData) {
      if (limit === 0) return;
      const lineIsVertical = step[0] === 0;
      const index = lineIsVertical ? 1 : 0;
      const inverseIndex = 1 - index;
      const stepIsPositive = step[index] > 0;
      const entryIntsectTile = stepIsPositive ? intsect1Tile : intsect2Tile;
      const exitIntsectTile = stepIsPositive ? intsect2Tile : intsect1Tile;
      let startCoords = [coords[0] + step[0], coords[1] + step[1]];
      if (stepIsPositive && startCoords[index] < entryIntsectTile[index] || !stepIsPositive && startCoords[index] > entryIntsectTile[index]) {
        const distToEntryIntsectTile = entryIntsectTile[index] - startCoords[index];
        const distInSteps = Math.ceil(distToEntryIntsectTile / step[index]);
        const distRoundedUpToNearestStep = distInSteps * step[index];
        const newStartXY = startCoords[index] + distRoundedUpToNearestStep;
        const yxToXStepRatio = step[inverseIndex] / step[index];
        const newStartYX = startCoords[inverseIndex] + distRoundedUpToNearestStep * yxToXStepRatio;
        startCoords = lineIsVertical ? [newStartYX, newStartXY] : [newStartXY, newStartYX];
      }
      let endCoords = exitIntsectTile;
      const xyWeShouldEnd = coords[index] + step[index] * limit;
      if (stepIsPositive && xyWeShouldEnd < endCoords[index] || !stepIsPositive && xyWeShouldEnd > endCoords[index]) {
        const yxWeShouldEnd = coords[inverseIndex] + step[inverseIndex] * limit;
        endCoords = lineIsVertical ? [yxWeShouldEnd, xyWeShouldEnd] : [xyWeShouldEnd, xyWeShouldEnd];
      }
      const vertexDataXDiff = startCoords[0] - coords[0];
      const vertexDataYDiff = startCoords[1] - coords[1];
      shiftVertexData(vertexData, vertexDataXDiff, vertexDataYDiff);
      const xyDist = stepIsPositive ? endCoords[index] - startCoords[index] : startCoords[index] - endCoords[index];
      if (xyDist < 0) return;
      const iterationCount = Math.floor((xyDist + Math.abs(step[index])) / Math.abs(step[index]));
      addDataDiagonalVariant(data2, vertexData, step, iterationCount);
    }
    function addDataDiagonalVariant(data2, vertexData, step, iterateCount) {
      for (let i = 0; i < iterateCount; i++) {
        data2.push(...vertexData);
        shiftVertexData(vertexData, step[0], step[1]);
      }
    }
    function shiftVertexData(data2, x, y) {
      data2[0] += x;
      data2[1] += y;
      data2[7] += x;
      data2[8] += y;
      data2[14] += x;
      data2[15] += y;
      data2[21] += x;
      data2[22] += y;
      data2[28] += x;
      data2[29] += y;
      data2[35] += x;
      data2[36] += y;
    }
    function renderBoundingBoxOfRenderRange() {
      if (!options2.isDebugModeOn()) return;
      const color = [1, 0, 1, 1];
      const data2 = bufferdata.getDataRect_FromTileBoundingBox(boundingBoxOfRenderRange, color);
      const model2 = buffermodel.createModel_Colored(new Float32Array(data2), 2, "LINE_LOOP");
      model2.render();
    }
    function highlightLastMove() {
      const lastMove = movesscript2.getCurrentMove(game2.getGamefile());
      if (!lastMove) return;
      const color = options2.getDefaultLastMoveHighlightColor();
      const data2 = [];
      data2.push(...bufferdata.getDataQuad_Color3D_FromCoord(lastMove.startCoords, z, color));
      data2.push(...bufferdata.getDataQuad_Color3D_FromCoord(lastMove.endCoords, z, color));
      const model2 = buffermodel.createModel_Colored(new Float32Array(data2), 3, "TRIANGLES");
      model2.render();
    }
    return Object.freeze({
      getOffset,
      render,
      regenModel,
      concatData_HighlightedMoves_Individual,
      concatData_HighlightedMoves_Sliding
    });
  }();

  // src/client/scripts/game/rendering/board.mjs
  var board2 = function() {
    let tiles_texture;
    let tiles256_texture;
    let tilesGrey78_texture;
    const squareCenter = 0.5;
    let darkTilesModel;
    let tileWidth_Pixels;
    let tile_MouseOver_Float;
    let tile_MouseOver_Int;
    let tiles_FingersOver_Float;
    let tiles_FingersOver_Int;
    let boundingBoxFloat;
    let boundingBox;
    const perspectiveMode_z = -0.01;
    const limitToDampScale = 1e-5;
    let whiteTiles;
    let darkTiles;
    function initTextures() {
      tiles_texture = texture.loadTexture("tiles", { useMipmaps: false });
      tiles256_texture = texture.loadTexture("tiles256", { useMipmaps: false });
      tilesGrey78_texture = texture.loadTexture("tilesGrey78", { useMipmaps: false });
    }
    function gsquareCenter() {
      return squareCenter;
    }
    function gtileWidth_Pixels() {
      return tileWidth_Pixels;
    }
    function gtile_MouseOver_Float() {
      return tile_MouseOver_Float;
    }
    function gtile_MouseOver_Int() {
      return tile_MouseOver_Int;
    }
    function gboundingBoxFloat() {
      return math2.deepCopyObject(boundingBoxFloat);
    }
    function gboundingBox() {
      return math2.deepCopyObject(boundingBox);
    }
    function glimitToDampScale() {
      return limitToDampScale;
    }
    function recalcVariables() {
      recalcTileWidth_Pixels();
      recalcTile_MouseCrosshairOver();
      recalcTiles_FingersOver();
      recalcBoundingBox();
    }
    function recalcTile_MouseCrosshairOver() {
      recalcTile_MouseOver();
      recalcTile_CrosshairOver();
    }
    function recalcTileWidth_Pixels() {
      const screenBoundingBox = options2.isDebugModeOn() ? camera2.getScreenBoundingBox(true) : camera2.getScreenBoundingBox(false);
      const pixelsPerTile = camera2.canvas.height * 0.5 / screenBoundingBox.top / camera2.getPixelDensity();
      tileWidth_Pixels = pixelsPerTile * movement.getBoardScale();
    }
    function recalcTile_MouseOver() {
      if (perspective2.isMouseLocked()) return;
      if (perspective2.getEnabled()) return setTile_MouseOverToUndefined();
      const tile_MouseOver_IntAndFloat = getTileMouseOver();
      tile_MouseOver_Float = tile_MouseOver_IntAndFloat.tile_Float;
      tile_MouseOver_Int = tile_MouseOver_IntAndFloat.tile_Int;
    }
    function setTile_MouseOverToUndefined() {
      tile_MouseOver_Float = void 0;
      tile_MouseOver_Int = void 0;
    }
    function recalcTile_CrosshairOver() {
      if (!perspective2.isMouseLocked()) return;
      const coords = math2.convertWorldSpaceToCoords(input2.getMouseWorldLocation());
      tile_MouseOver_Float = coords;
      tile_MouseOver_Int = [Math.floor(coords[0] + squareCenter), Math.floor(coords[1] + squareCenter)];
    }
    function recalcTiles_FingersOver() {
      tiles_FingersOver_Float = {};
      tiles_FingersOver_Int = {};
      for (let i = 0; i < input2.getTouchHelds().length; i++) {
        const thisTouch = input2.getTouchHelds()[i];
        const touchTileAndFloat = gtileCoordsOver(thisTouch.x, thisTouch.y);
        tiles_FingersOver_Float[thisTouch.id] = touchTileAndFloat.tile_Float;
        tiles_FingersOver_Int[thisTouch.id] = touchTileAndFloat.tile_Int;
      }
    }
    function gtileCoordsOver(x, y) {
      const n = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const boardPos = movement.getBoardPos();
      const tileXFloat = n * x / tileWidth_Pixels + boardPos[0];
      const tileYFloat = n * y / tileWidth_Pixels + boardPos[1];
      const tile_Float = [tileXFloat, tileYFloat];
      const tile_Int = [Math.floor(tileXFloat + squareCenter), Math.floor(tileYFloat + squareCenter)];
      return { tile_Float, tile_Int };
    }
    function getTileMouseOver() {
      const mouseWorld = input2.getMouseWorldLocation();
      const tile_Float = math2.convertWorldSpaceToCoords(mouseWorld);
      const tile_Int = [Math.floor(tile_Float[0] + squareCenter), Math.floor(tile_Float[1] + squareCenter)];
      return { tile_Float, tile_Int };
    }
    function gpositionFingerOver(touchID) {
      return {
        id: touchID,
        x: tiles_FingersOver_Float[touchID][0],
        y: tiles_FingersOver_Float[touchID][1]
      };
    }
    function recalcBoundingBox() {
      boundingBoxFloat = math2.getBoundingBoxOfBoard(movement.getBoardPos(), movement.getBoardScale(), camera2.getScreenBoundingBox());
      boundingBox = roundAwayBoundingBox(boundingBoxFloat);
    }
    function roundAwayBoundingBox(src) {
      const left = Math.floor(src.left + squareCenter);
      const right = Math.ceil(src.right - 1 + squareCenter);
      const bottom = Math.floor(src.bottom + squareCenter);
      const top = Math.ceil(src.top - 1 + squareCenter);
      return { left, right, bottom, top };
    }
    function regenBoardModel() {
      const boardScale = movement.getBoardScale();
      const TwoTimesScale = 2 * boardScale;
      const inPerspective = perspective2.getEnabled();
      const a = perspective2.distToRenderBoard;
      const startX = inPerspective ? -a : camera2.getScreenBoundingBox(false).left;
      const endX = inPerspective ? a : camera2.getScreenBoundingBox(false).right;
      const startY = inPerspective ? -a : camera2.getScreenBoundingBox(false).bottom;
      const endY = inPerspective ? a : camera2.getScreenBoundingBox(false).top;
      const boardPos = movement.getBoardPos();
      const texCoordStartX = (boardPos[0] + squareCenter + startX / boardScale) % 2 / 2 - 1 / 1e3;
      const texCoordStartY = (boardPos[1] + squareCenter + startY / boardScale) % 2 / 2 - 1 / 1e3;
      const texCoordEndX = texCoordStartX + (endX - startX) / TwoTimesScale;
      const texCoordEndY = texCoordStartY + (endY - startY) / TwoTimesScale;
      const [wr, wg, wb, wa] = whiteTiles;
      const z = perspective2.getEnabled() ? perspectiveMode_z : 0;
      const data = [];
      const whiteTilesData = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texCoordStartX, texCoordStartY, texCoordEndX, texCoordEndY, wr, wg, wb, wa);
      data.push(...whiteTilesData);
      const texture2 = perspective2.getEnabled() ? tiles256_texture : tiles_texture;
      return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", texture2);
    }
    function initDarkTilesModel() {
      if (!darkTiles) resetColor();
      const inPerspective = perspective2.getEnabled();
      const dist = perspective2.distToRenderBoard;
      const screenBoundingBox = camera2.getScreenBoundingBox(false);
      const startX = inPerspective ? -dist : screenBoundingBox.left;
      const endX = inPerspective ? dist : screenBoundingBox.right;
      const startY = inPerspective ? -dist : screenBoundingBox.bottom;
      const endY = inPerspective ? dist : screenBoundingBox.top;
      const z = perspective2.getEnabled() ? perspectiveMode_z : 0;
      const [r, g, b, a] = darkTiles;
      const data = bufferdata.getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a);
      const dataFloat32 = new Float32Array(data);
      darkTilesModel = buffermodel.createModel_Colored(dataFloat32, 3, "TRIANGLES");
    }
    function renderMainBoard() {
      if (movement.isScaleLess1Pixel_Physical()) return;
      const model = regenBoardModel();
      darkTilesModel.render();
      model.render();
    }
    function isOffsetOutOfRangeOfRegenRange(offset, regenRange) {
      const boardPos = movement.getBoardPos();
      const xDiff = Math.abs(boardPos[0] - offset[0]);
      const yDiff = Math.abs(boardPos[1] - offset[1]);
      if (xDiff > regenRange || yDiff > regenRange) return true;
      return false;
    }
    function changeTheme(args) {
      if (args.whiteTiles) options2.themes[options2.gtheme()].whiteTiles = args.whiteTiles;
      if (args.darkTiles) options2.themes[options2.gtheme()].darkTiles = args.darkTiles;
      ifThemeArgumentDefined_Set(args, "whiteTiles");
      ifThemeArgumentDefined_Set(args, "darkTiles");
      ifThemeArgumentDefined_Set(args, "selectedPieceHighlightColor");
      ifThemeArgumentDefined_Set(args, "legalMovesHighlightColor_Friendly");
      ifThemeArgumentDefined_Set(args, "lastMoveHighlightColor");
      ifThemeArgumentDefined_Set(args, "checkHighlightColor");
      ifThemeArgumentDefined_Set(args, "useColoredPieces");
      ifThemeArgumentDefined_Set_AndEnableColor(args, "whitePiecesColor");
      ifThemeArgumentDefined_Set_AndEnableColor(args, "blackPiecesColor");
      ifThemeArgumentDefined_Set_AndEnableColor(args, "neutralPiecesColor");
      updateTheme();
      piecesmodel.regenModel(game.getGamefile(), options2.getPieceRegenColorArgs());
      highlights.regenModel();
    }
    function ifThemeArgumentDefined_Set(args, argumentName) {
      if (args[argumentName] != null) options2.themes[options2.gtheme()][argumentName] = args[argumentName];
    }
    function ifThemeArgumentDefined_Set_AndEnableColor(args, argumentName) {
      if (args[argumentName] != null) {
        options2.themes[options2.gtheme()][argumentName] = args[argumentName];
        options2.themes[options2.gtheme()].useColoredPieces = true;
      }
    }
    function updateTheme() {
      resetColor();
      updateSkyColor();
      updateNavColor();
    }
    function updateSkyColor() {
      const avgR = (whiteTiles[0] + darkTiles[0]) / 2;
      const avgG = (whiteTiles[1] + darkTiles[1]) / 2;
      const avgB = (whiteTiles[2] + darkTiles[2]) / 2;
      const dimAmount = 0.27;
      const skyR = avgR - dimAmount;
      const skyG = avgG - dimAmount;
      const skyB = avgB - dimAmount;
      webgl.setClearColor([skyR, skyG, skyB]);
    }
    function updateNavColor() {
      const avgR = (whiteTiles[0] + darkTiles[0]) / 2;
      const avgG = (whiteTiles[1] + darkTiles[1]) / 2;
      const avgB = (whiteTiles[2] + darkTiles[2]) / 2;
      let navR = 255;
      let navG = 255;
      let navB = 255;
      if (!options2.isThemeDefault()) {
        const brightAmount = 0.6;
        navR = (1 - (1 - avgR) * (1 - brightAmount)) * 255;
        navG = (1 - (1 - avgG) * (1 - brightAmount)) * 255;
        navB = (1 - (1 - avgB) * (1 - brightAmount)) * 255;
      }
      style.setNavStyle(`

            .navigation {
                background: linear-gradient(to top, rgba(${navR}, ${navG}, ${navB}, 0.104), rgba(${navR}, ${navG}, ${navB}, 0.552), rgba(${navR}, ${navG}, ${navB}, 0.216));
            }

            .footer {
                background: linear-gradient(to bottom, rgba(${navR}, ${navG}, ${navB}, 0.307), rgba(${navR}, ${navG}, ${navB}, 1), rgba(${navR}, ${navG}, ${navB}, 0.84));
            }
        `);
    }
    function changeColor(newWhiteTiles, newDarkTiles) {
      main2.renderThisFrame();
      whiteTiles = newWhiteTiles;
      darkTiles = newDarkTiles;
      initDarkTilesModel();
    }
    function resetColor() {
      whiteTiles = options2.getDefaultTiles(true);
      darkTiles = options2.getDefaultTiles(false);
      initDarkTilesModel();
      main2.renderThisFrame();
    }
    function darkenColor() {
      const whiteTiles2 = options2.getDefaultTiles(true);
      ;
      const darkTiles2 = options2.getDefaultTiles(false);
      const darkenBy = 0.09;
      const darkWR = whiteTiles2[0] - darkenBy;
      const darkWG = whiteTiles2[1] - darkenBy;
      const darkWB = whiteTiles2[2] - darkenBy;
      const darkDR = darkTiles2[0] - darkenBy;
      const darkDG = darkTiles2[1] - darkenBy;
      const darkDB = darkTiles2[2] - darkenBy;
      changeColor([darkWR, darkWG, darkWB, 1], [darkDR, darkDG, darkDB, 1]);
    }
    function render() {
      webgl.executeWithDepthFunc_ALWAYS(() => {
        renderSolidCover();
        renderMainBoard();
        renderFractalBoards();
      });
    }
    function renderFractalBoards() {
      const e = -math2.getBaseLog10(movement.getBoardScale());
      const startE = 0.5;
      if (e < startE) return;
      const interval = 3;
      const length = 6;
      let firstInterval = Math.floor((e - startE) / interval) * interval + startE;
      const zeroCount = 3 * (firstInterval - startE) / interval + 3;
      const capOpacity = 0.7;
      let zoom = Math.pow(10, zeroCount);
      let x = (firstInterval - e) / length;
      let opacity = capOpacity * Math.pow(-0.5 * Math.cos(2 * x * Math.PI) + 0.5, 0.7);
      renderZoomedBoard(zoom, opacity);
      firstInterval -= interval;
      if (firstInterval < 0) return;
      zoom /= Math.pow(10, 3);
      x = (firstInterval - e) / length;
      opacity = capOpacity * (-0.5 * Math.cos(2 * x * Math.PI) + 0.5);
      renderZoomedBoard(zoom, opacity);
    }
    function renderSolidCover() {
      const dist = camera2.getZFar() / Math.SQRT2;
      const z = perspective2.getEnabled() ? perspectiveMode_z : 0;
      const cameraZ = camera2.getPosition(true)[2];
      const r = (whiteTiles[0] + darkTiles[0]) / 2;
      const g = (whiteTiles[1] + darkTiles[1]) / 2;
      const b = (whiteTiles[2] + darkTiles[2]) / 2;
      const a = (whiteTiles[3] + darkTiles[3]) / 2;
      const data = bufferdata.getDataBoxTunnel(-dist, -dist, cameraZ, dist, dist, z, r, g, b, a);
      data.push(...bufferdata.getDataQuad_Color3D(-dist, -dist, dist, dist, z, r, g, b, a));
      const model = buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
      model.render();
    }
    function renderZoomedBoard(zoom, opacity) {
      const zoomTimesScale = zoom * movement.getBoardScale();
      const zoomTimesScaleTwo = zoomTimesScale * 2;
      const inPerspective = perspective2.getEnabled();
      const c = perspective2.distToRenderBoard;
      const startX = inPerspective ? -c : camera2.getScreenBoundingBox(false).left;
      const endX = inPerspective ? c : camera2.getScreenBoundingBox(false).right;
      const startY = inPerspective ? -c : camera2.getScreenBoundingBox(false).bottom;
      const endY = inPerspective ? c : camera2.getScreenBoundingBox(false).top;
      const boardPos = movement.getBoardPos();
      const texStartX = ((boardPos[0] + squareCenter) / zoom + startX / zoomTimesScale) % 2 / 2 - 1 / 1e3;
      const texStartY = ((boardPos[1] + squareCenter) / zoom + startY / zoomTimesScale) % 2 / 2 - 1 / 1e3;
      const texCoordDiffX = (endX - startX) / zoomTimesScaleTwo;
      const screenTexCoordDiffX = (camera2.getScreenBoundingBox(false).right - camera2.getScreenBoundingBox(false).left) / zoomTimesScaleTwo;
      const diffWhen1TileIs1Pixel = camera2.canvas.width / 2;
      if (screenTexCoordDiffX > diffWhen1TileIs1Pixel) return;
      const texCoordDiffY = (endY - startY) / zoomTimesScaleTwo;
      const texEndX = texStartX + texCoordDiffX;
      const texEndY = texStartY + texCoordDiffY;
      const texStartXB = texStartX + 0.5;
      const texEndXB = texEndX + 0.5;
      const z = perspective2.getEnabled() ? perspectiveMode_z : 0;
      let [wr, wg, wb, wa] = whiteTiles;
      wa *= opacity;
      let [dr, dg, db, da] = darkTiles;
      da *= opacity;
      const data = [];
      const dataWhiteTiles = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, wr, wg, wb, wa);
      data.push(...dataWhiteTiles);
      const dataDarkTiles = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartXB, texStartY, texEndXB, texEndY, dr, dg, db, da);
      data.push(...dataDarkTiles);
      const texture2 = perspective2.getEnabled() ? tiles256_texture : tiles_texture;
      const model = buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", texture2);
      model.render();
    }
    return Object.freeze({
      gsquareCenter,
      initTextures,
      gtileWidth_Pixels,
      recalcVariables,
      gtile_MouseOver_Float,
      isOffsetOutOfRangeOfRegenRange,
      gpositionFingerOver,
      initDarkTilesModel,
      gtile_MouseOver_Int,
      recalcTileWidth_Pixels,
      gtileCoordsOver,
      roundAwayBoundingBox,
      gboundingBox,
      changeTheme,
      gboundingBoxFloat,
      updateTheme,
      resetColor,
      glimitToDampScale,
      darkenColor,
      render,
      getTileMouseOver,
      recalcTile_MouseCrosshairOver,
      recalcTiles_FingersOver
    });
  }();

  // src/client/scripts/game/rendering/bufferdata.mjs
  var bufferdata = function() {
    function getCoordDataOfTile(coords) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const startX = (coords[0] - board2.gsquareCenter() - boardPos[0]) * boardScale;
      const startY = (coords[1] - board2.gsquareCenter() - boardPos[1]) * boardScale;
      const endX = startX + /* 1 * */
      boardScale;
      const endY = startY + /* 1 * */
      boardScale;
      return {
        startX,
        startY,
        endX,
        endY
      };
    }
    function getCoordDataOfTile_WithOffset(offset, coords) {
      const startX = coords[0] - board2.gsquareCenter() - offset[0];
      const startY = coords[1] - board2.gsquareCenter() - offset[1];
      const endX = startX + 1;
      const endY = startY + 1;
      return {
        startX,
        startY,
        endX,
        endY
      };
    }
    function getCoordDataOfTileBoundingBox(boundingBox) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const startX = (boundingBox.left - boardPos[0] - board2.gsquareCenter()) * boardScale;
      const endX = (boundingBox.right - boardPos[0] + 1 - board2.gsquareCenter()) * boardScale;
      const startY = (boundingBox.bottom - boardPos[1] - board2.gsquareCenter()) * boardScale;
      const endY = (boundingBox.top - boardPos[1] + 1 - board2.gsquareCenter()) * boardScale;
      return { startX, startY, endX, endY };
    }
    function getTexDataOfType(type, rotation = 1) {
      const texLocation = pieces.getSpritesheetDataTexLocation(type);
      const texWidth = pieces.getSpritesheetDataPieceWidth();
      const texStartX = texLocation[0];
      const texStartY = texLocation[1];
      if (rotation === 1) return {
        // Regular rotation
        texStartX,
        texStartY,
        texEndX: texStartX + texWidth,
        texEndY: texStartY + texWidth
      };
      return {
        // Inverted rotation
        texStartX: texStartX + texWidth,
        texStartY: texStartY + texWidth,
        texEndX: texStartX,
        texEndY: texStartY
      };
    }
    function getDataQuad_Color(startX, startY, endX, endY, r, g, b, a) {
      return [
        //      Position            Color
        startX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        r,
        g,
        b,
        a
      ];
    }
    function getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a) {
      return [
        //      Position               Color
        startX,
        startY,
        z,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        r,
        g,
        b,
        a,
        endX,
        endY,
        z,
        r,
        g,
        b,
        a
      ];
    }
    function getDataQuad_Texture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY) {
      return [
        //     Position            Texture Coord
        startX,
        startY,
        texStartX,
        texStartY,
        startX,
        endY,
        texStartX,
        texEndY,
        endX,
        startY,
        texEndX,
        texStartY,
        endX,
        startY,
        texEndX,
        texStartY,
        startX,
        endY,
        texStartX,
        texEndY,
        endX,
        endY,
        texEndX,
        texEndY
      ];
    }
    function getDataQuad_Texture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY) {
      return [
        //     Position               Texture Coord
        startX,
        startY,
        z,
        texStartX,
        texStartY,
        startX,
        endY,
        z,
        texStartX,
        texEndY,
        endX,
        startY,
        z,
        texEndX,
        texStartY,
        endX,
        startY,
        z,
        texEndX,
        texStartY,
        startX,
        endY,
        z,
        texStartX,
        texEndY,
        endX,
        endY,
        z,
        texEndX,
        texEndY
      ];
    }
    function getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a) {
      return [
        //     Position           Texture Coord              Color
        startX,
        startY,
        texStartX,
        texStartY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        texStartX,
        texEndY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        texEndX,
        texStartY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        texEndX,
        texStartY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        texStartX,
        texEndY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        texEndX,
        texEndY,
        r,
        g,
        b,
        a
      ];
    }
    function getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a) {
      return [
        //     Position           Texture Coord              Color
        startX,
        startY,
        z,
        texStartX,
        texStartY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        texStartX,
        texEndY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        texEndX,
        texStartY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        texEndX,
        texStartY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        texStartX,
        texEndY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        z,
        texEndX,
        texEndY,
        r,
        g,
        b,
        a
      ];
    }
    function getDataRect(startX, startY, endX, endY, r, g, b, a) {
      return [
        //       x y               color
        startX,
        startY,
        r,
        g,
        b,
        a,
        startX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        endY,
        r,
        g,
        b,
        a,
        endX,
        startY,
        r,
        g,
        b,
        a
      ];
    }
    function getDataCircle(x, y, radius, r, g, b, a, resolution) {
      if (resolution == null) return console.error("Cannot get data of circle with no specified resolution!");
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a circle.");
      const data = [];
      for (let i = 0; i < resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const thisX = x + radius * Math.cos(theta);
        const thisY = y + radius * Math.sin(theta);
        data.push(thisX, thisY, r, g, b, a);
      }
      return data;
    }
    function getDataBoxTunnel(startX, startY, startZ, endX, endY, endZ, r, g, b, a) {
      return [
        //     Vertex                  Color
        startX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        startY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        startY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        startY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        endX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        startX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        startY,
        startZ,
        r,
        g,
        b,
        a,
        startX,
        endY,
        endZ,
        r,
        g,
        b,
        a,
        startX,
        startY,
        endZ,
        r,
        g,
        b,
        a
      ];
    }
    function getDataCircle3D(x, y, z, radius, resolution, r, g, b, a) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a circle.");
      const data = [];
      for (let i = 0; i < resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const nextTheta = (i + 1) / resolution * 2 * Math.PI;
        const centerX = x;
        const centerY = y;
        const thisX = x + radius * Math.cos(theta);
        const thisY = y + radius * Math.sin(theta);
        const nextX = x + radius * Math.cos(nextTheta);
        const nextY = y + radius * Math.sin(nextTheta);
        data.push(centerX, centerY, z, r, g, b, a);
        data.push(thisX, thisY, z, r, g, b, a);
        data.push(nextX, nextY, z, r, g, b, a);
      }
      return data;
    }
    function getModelCircle3D(x, y, z, radius, resolution, r, g, b, a) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a fuzz ball.");
      const data = [x, y, z, r, g, b, a];
      for (let i = 0; i <= resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const thisX = x + radius * Math.cos(theta);
        const thisY = y + radius * Math.sin(theta);
        data.push(thisX, thisY, z, r, g, b, a);
      }
      return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLE_FAN");
    }
    function getDataFuzzBall3D(x, y, z, radius, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a fuzz ball.");
      const data = [x, y, z, r1, g1, b1, a1];
      for (let i = 0; i <= resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const thisX = x + radius * Math.cos(theta);
        const thisY = y + radius * Math.sin(theta);
        data.push(...[thisX, thisY, z, r2, g2, b2, a2]);
      }
      return data;
    }
    function getDataRingSolid(x, y, inRad, outRad, resolution, r, g, b, a) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a ring.");
      const data = [];
      for (let i = 0; i < resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const nextTheta = (i + 1) / resolution * 2 * Math.PI;
        const innerX = x + inRad * Math.cos(theta);
        const innerY = y + inRad * Math.sin(theta);
        const outerX = x + outRad * Math.cos(theta);
        const outerY = y + outRad * Math.sin(theta);
        const innerXNext = x + inRad * Math.cos(nextTheta);
        const innerYNext = y + inRad * Math.sin(nextTheta);
        const outerXNext = x + outRad * Math.cos(nextTheta);
        const outerYNext = y + outRad * Math.sin(nextTheta);
        data.push(
          innerX,
          innerY,
          r,
          g,
          b,
          a,
          outerX,
          outerY,
          r,
          g,
          b,
          a,
          innerXNext,
          innerYNext,
          r,
          g,
          b,
          a,
          outerX,
          outerY,
          r,
          g,
          b,
          a,
          outerXNext,
          outerYNext,
          r,
          g,
          b,
          a,
          innerXNext,
          innerYNext,
          r,
          g,
          b,
          a
        );
      }
      return data;
    }
    function getDataRing3D(x, y, z, inRad, outRad, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get data of a ring.");
      const data = [];
      for (let i = 0; i < resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const nextTheta = (i + 1) / resolution * 2 * Math.PI;
        const innerX = x + inRad * Math.cos(theta);
        const innerY = y + inRad * Math.sin(theta);
        const outerX = x + outRad * Math.cos(theta);
        const outerY = y + outRad * Math.sin(theta);
        const innerXNext = x + inRad * Math.cos(nextTheta);
        const innerYNext = y + inRad * Math.sin(nextTheta);
        const outerXNext = x + outRad * Math.cos(nextTheta);
        const outerYNext = y + outRad * Math.sin(nextTheta);
        data.push(
          innerX,
          innerY,
          z,
          r1,
          g1,
          b1,
          a1,
          outerX,
          outerY,
          z,
          r2,
          g2,
          b2,
          a2,
          innerXNext,
          innerYNext,
          z,
          r1,
          g1,
          b1,
          a1,
          outerX,
          outerY,
          z,
          r2,
          g2,
          b2,
          a2,
          outerXNext,
          outerYNext,
          z,
          r2,
          g2,
          b2,
          a2,
          innerXNext,
          innerYNext,
          z,
          r1,
          g1,
          b1,
          a1
        );
      }
      return data;
    }
    function getModelRing3D(x, y, z, inRad, outRad, resolution, r1, g1, b1, a1, r2, g2, b2, a2) {
      if (resolution < 3) return console.error("Resolution must be 3+ to get model of a ring.");
      const data = [];
      for (let i = 0; i <= resolution; i++) {
        const theta = i / resolution * 2 * Math.PI;
        const innerX = x + inRad * Math.cos(theta);
        const innerY = y + inRad * Math.sin(theta);
        const outerX = x + outRad * Math.cos(theta);
        const outerY = y + outRad * Math.sin(theta);
        data.push(innerX, innerY, z, r1, g1, b1, a1);
        data.push(outerX, outerY, z, r2, g2, b2, a2);
      }
      return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLE_STRIP");
    }
    function getDataQuad_Color_FromCoord(coords, color) {
      const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
      const [r, g, b, a] = color;
      return getDataQuad_Color(startX, startY, endX, endY, r, g, b, a);
    }
    function getDataQuad_Color_FromCoord_WithOffset(offset, coords, color) {
      const { startX, startY, endX, endY } = getCoordDataOfTile_WithOffset(offset, coords);
      const [r, g, b, a] = color;
      return getDataQuad_Color(startX, startY, endX, endY, r, g, b, a);
    }
    function getDataQuad_Color3D_FromCoord(coords, z, color) {
      const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
      const [r, g, b, a] = color;
      return getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a);
    }
    function getDataQuad_Color3D_FromCoord_WithOffset(offset, coords, z, color) {
      const { startX, startY, endX, endY } = getCoordDataOfTile_WithOffset(offset, coords);
      const [r, g, b, a] = color;
      return getDataQuad_Color3D(startX, startY, endX, endY, z, r, g, b, a);
    }
    function getDataQuad_ColorTexture_FromCoordAndType(coords, type, color) {
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
      const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
      const { r, g, b, a } = color;
      return getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }
    function getDataQuad_ColorTexture3D_FromCoordAndType(coords, z, type, color) {
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
      const { startX, startY, endX, endY } = getCoordDataOfTile(coords);
      const { r, g, b, a } = color;
      return getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }
    function getDataQuad_ColorTexture_FromPositionWidthType(x, y, width, type, color) {
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = getTexDataOfType(type, rotation);
      const halfWidth = width / 2;
      const startX = x - halfWidth;
      const endX = x + halfWidth;
      const startY = y - halfWidth;
      const endY = y + halfWidth;
      const { r, g, b, a } = color;
      return getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
    }
    function getDataRect_FromTileBoundingBox(boundingBox, color) {
      const { startX, startY, endX, endY } = getCoordDataOfTileBoundingBox(boundingBox);
      const [r, g, b, a] = color;
      return getDataRect(startX, startY, endX, endY, r, g, b, a);
    }
    function rotateDataTexture(data, rotation = 1) {
      const copiedData = data.slice();
      const texWidth = pieces.getSpritesheetDataPieceWidth() * rotation;
      copiedData[2] += texWidth;
      copiedData[3] += texWidth;
      copiedData[6] += texWidth;
      copiedData[7] -= texWidth;
      copiedData[10] -= texWidth;
      copiedData[11] += texWidth;
      copiedData[14] -= texWidth;
      copiedData[15] += texWidth;
      copiedData[18] += texWidth;
      copiedData[19] -= texWidth;
      copiedData[22] -= texWidth;
      copiedData[23] -= texWidth;
      return copiedData;
    }
    function rotateDataColorTexture(data, rotation = 1) {
      const copiedData = data.slice();
      const texWidth = pieces.getSpritesheetDataPieceWidth() * rotation;
      copiedData[2] += texWidth;
      copiedData[3] += texWidth;
      copiedData[10] += texWidth;
      copiedData[11] -= texWidth;
      copiedData[18] -= texWidth;
      copiedData[19] += texWidth;
      copiedData[26] -= texWidth;
      copiedData[27] += texWidth;
      copiedData[34] += texWidth;
      copiedData[35] -= texWidth;
      copiedData[42] -= texWidth;
      copiedData[43] -= texWidth;
      return copiedData;
    }
    return Object.freeze({
      getCoordDataOfTile,
      getCoordDataOfTile_WithOffset,
      getCoordDataOfTileBoundingBox,
      getTexDataOfType,
      getDataQuad_Color,
      getDataQuad_Color3D,
      getDataQuad_Texture,
      getDataQuad_Texture3D,
      getDataQuad_ColorTexture,
      getDataQuad_ColorTexture3D,
      getDataRect,
      getDataCircle,
      getDataBoxTunnel,
      getDataCircle3D,
      getModelCircle3D,
      getDataFuzzBall3D,
      getDataRingSolid,
      getDataRing3D,
      getModelRing3D,
      getDataQuad_Color_FromCoord,
      getDataQuad_Color_FromCoord_WithOffset,
      getDataQuad_Color3D_FromCoord,
      getDataQuad_Color3D_FromCoord_WithOffset,
      getDataQuad_ColorTexture_FromCoordAndType,
      getDataQuad_ColorTexture3D_FromCoordAndType,
      getDataQuad_ColorTexture_FromPositionWidthType,
      getDataRect_FromTileBoundingBox,
      rotateDataTexture,
      rotateDataColorTexture
    });
  }();

  // src/client/scripts/game/input.mjs
  var input2 = function() {
    const overlayElement = document.getElementById("overlay");
    const leftMouseKey = 0;
    const middleMouseKey = 1;
    const rightMouseKey = 2;
    let touchDowns = [];
    const touchHelds = [];
    let touchClicked = false;
    const touchClickedDelaySeconds = 0.12;
    let timeTouchDownSeconds;
    let touchClickedTile;
    let touchClickedWorld;
    let mouseDowns = [];
    const mouseHelds = [];
    let keyDowns = [];
    const keyHelds = [];
    let mouseWheel = 0;
    let mouseClicked = false;
    const mouseClickedDelaySeconds = 0.4;
    let timeMouseDownSeconds;
    let mouseClickedTile;
    let mouseClickedPixels;
    const pixelDistToCancelClick = 10;
    let mousePos = [0, 0];
    let mouseMoved = true;
    let mouseWorldLocation = [0, 0];
    let ignoreMouseDown = false;
    let mouseIsSupported = true;
    const dampeningToMoveMouseInTouchMode = 0.5;
    const percOfScreenMouseCanGo = 0.4;
    const mouseInnerWidth = 0;
    const mouseOuterWidth = 6.5;
    const mouseOpacity = 0.5;
    function getTouchHelds() {
      return touchHelds;
    }
    function getTouchClicked() {
      return touchClicked;
    }
    function getTouchClickedTile() {
      return touchClickedTile;
    }
    function getTouchClickedWorld() {
      return touchClickedWorld;
    }
    function getMouseWheel() {
      return mouseWheel;
    }
    function getMouseClickedTile() {
      return mouseClickedTile;
    }
    function getMouseClicked() {
      return mouseClicked;
    }
    function getMousePos() {
      return [mousePos[0], mousePos[1]];
    }
    function getMouseMoved() {
      return mouseMoved;
    }
    function getMouseWorldLocation() {
      return [mouseWorldLocation[0], mouseWorldLocation[1]];
    }
    function initListeners() {
      window.addEventListener("resize", camera2.onScreenResize);
      initListeners_Touch();
      initListeners_Mouse();
      initListeners_Keyboard();
      overlayElement.addEventListener("contextmenu", (event2) => {
        event2 = event2 || window.event;
        const isOverlay = event2.target.id === "overlay";
        if (isOverlay) event2.preventDefault();
      });
      checkIfMouseNotSupported();
    }
    function checkIfMouseNotSupported() {
      if (window.matchMedia("(pointer: fine)").matches) return;
      mouseIsSupported = false;
      console.log("Mouse is not supported on this device. Disabling perspective mode.");
      guipause2.getelement_perspective().classList.add("opacity-0_5");
    }
    function initListeners_Touch() {
      overlayElement.addEventListener("touchstart", (event2) => {
        if (perspective2.getEnabled()) return;
        event2 = event2 || window.event;
        const isButton = typeof event2.target.className === "string" && event2.target.className.includes("button");
        const clickedOverlay = event2.target.id === "overlay";
        if (clickedOverlay) event2.preventDefault();
        if (ignoreMouseDown) return;
        pushTouches(event2.changedTouches);
        calcMouseWorldLocation();
        board2.recalcTiles_FingersOver();
        initTouchSimulatedClick();
      });
      overlayElement.addEventListener("touchmove", (event2) => {
        if (perspective2.getEnabled()) return;
        event2 = event2 || window.event;
        const touches = event2.changedTouches;
        for (let i = 0; i < touches.length; i++) {
          const thisTouch = touches[i];
          const touchCoords = convertCoords_CenterOrigin(thisTouch);
          touchHelds_UpdateTouch(thisTouch.identifier, touchCoords);
        }
        calcMouseWorldLocation();
      });
      overlayElement.addEventListener("touchend", callback_TouchPointEnd);
      overlayElement.addEventListener("touchcancel", callback_TouchPointEnd);
    }
    function pushTouches(touches) {
      for (let i = 0; i < touches.length; i++) {
        const thisTouch = touches[i];
        const touchCoords = convertCoords_CenterOrigin(thisTouch);
        const touch = {
          id: thisTouch.identifier,
          x: touchCoords[0],
          y: touchCoords[1],
          changeInX: 0,
          changeInY: 0
        };
        touchDowns.push(touch);
        touchHelds.push(touch);
      }
    }
    function initTouchSimulatedClick() {
      if (touchHelds.length === 1 && !touchClicked) {
        timeTouchDownSeconds = (/* @__PURE__ */ new Date()).getTime() / 1e3;
        const touchTile = board2.gtileCoordsOver(touchHelds[0].x, touchHelds[0].y).tile_Int;
        touchClickedTile = { id: touchHelds[0].id, x: touchTile[0], y: touchTile[1] };
        const oneOrNegOne = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
        touchClickedWorld = [oneOrNegOne * math2.convertPixelsToWorldSpace_Virtual(touchHelds[0].x), oneOrNegOne * math2.convertPixelsToWorldSpace_Virtual(touchHelds[0].y)];
      }
    }
    function convertCoords_CenterOrigin(object) {
      const rawX = object.clientX - camera2.getCanvasRect().left;
      const rawY = -(object.clientY - camera2.getCanvasRect().top);
      const canvasPixelWidth = camera2.canvas.width / camera2.getPixelDensity();
      const canvasPixelHeight = camera2.canvas.height / camera2.getPixelDensity();
      return [rawX - canvasPixelWidth / 2, rawY + canvasPixelHeight / 2];
    }
    function callback_TouchPointEnd(event2) {
      event2 = event2 || window.event;
      const touches = event2.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        touchHelds_DeleteTouch(touches[i].identifier);
        if (ignoreMouseDown) return;
        if (touches[i].identifier === touchClickedTile?.id) {
          const nowSeconds = (/* @__PURE__ */ new Date()).getTime() / 1e3;
          const timePassed = nowSeconds - timeTouchDownSeconds;
          if (timePassed < touchClickedDelaySeconds) {
            touchClicked = true;
          }
        }
      }
    }
    function touchHelds_UpdateTouch(id, touchCoords) {
      for (let i = 0; i < touchHelds.length; i++) {
        const thisTouch = touchHelds[i];
        if (thisTouch.id !== id) continue;
        thisTouch.changeInX += touchCoords[0] - thisTouch.x;
        thisTouch.changeInY += touchCoords[1] - thisTouch.y;
        thisTouch.x = touchCoords[0];
        thisTouch.y = touchCoords[1];
      }
    }
    function touchHelds_DeleteTouch(id) {
      for (let i = 0; i < touchHelds.length; i++) {
        const thisTouch = touchHelds[i];
        if (thisTouch.id === id) {
          touchHelds.splice(i, 1);
          break;
        }
      }
      for (let i = 0; i < touchDowns.length; i++) {
        const thisTouch = touchDowns[i];
        if (thisTouch.id === id) {
          touchDowns.splice(i, 1);
          break;
        }
      }
    }
    function initListeners_Mouse() {
      window.addEventListener("mousemove", (event2) => {
        event2 = event2 || window.event;
        const renderThisFrame = !guipause2.areWePaused() && (arrows.getMode() !== 0 || movement.isScaleLess1Pixel_Virtual() || selection2.isAPieceSelected() || perspective2.getEnabled());
        if (renderThisFrame) main2.renderThisFrame();
        const mouseCoords = convertCoords_CenterOrigin(event2);
        mousePos = mouseCoords;
        mouseMoved = true;
        calcMouseWorldLocation();
        calcCrosshairWorldLocation();
        perspective2.update(event2.movementX, event2.movementY);
      });
      overlayElement.addEventListener("wheel", (event2) => {
        event2 = event2 || window.event;
        addMouseWheel(event2);
      });
      document.addEventListener("wheel", (event2) => {
        event2 = event2 || window.event;
        if (!perspective2.getEnabled()) return;
        if (!perspective2.isMouseLocked()) return;
        addMouseWheel(event2);
      });
      overlayElement.addEventListener("mousedown", (event2) => {
        event2 = event2 || window.event;
        touchClicked = false;
        touchClickedWorld = void 0;
        if (ignoreMouseDown) return;
        if (event2.target.id === "overlay") event2.preventDefault();
        pushMouseDown(event2);
        calcMouseWorldLocation();
        calcCrosshairWorldLocation();
        board2.recalcTile_MouseCrosshairOver();
        if (event2.button === 0) initMouseSimulatedClick();
      });
      document.addEventListener("mousedown", (event2) => {
        event2 = event2 || window.event;
        if (!perspective2.getEnabled()) return;
        if (!perspective2.isMouseLocked()) return;
        pushMouseDown(event2);
        if (event2.button === 0) initMouseSimulatedClick();
      });
      overlayElement.addEventListener("mouseup", (event2) => {
        event2 = event2 || window.event;
        removeMouseHeld(event2);
        setTimeout(perspective2.relockMouse, 1);
        if (event2.button === 0) executeMouseSimulatedClick();
      });
      document.addEventListener("mouseup", (event2) => {
        event2 = event2 || window.event;
        if (!perspective2.getEnabled()) return;
        if (!perspective2.isMouseLocked()) return;
        removeMouseHeld(event2);
        executeMouseSimulatedClick();
      });
    }
    function initMouseSimulatedClick() {
      if (mouseClicked) return;
      if (guipause2.areWePaused()) return;
      if (perspective2.getEnabled() && !perspective2.isMouseLocked()) return;
      timeMouseDownSeconds = (/* @__PURE__ */ new Date()).getTime() / 1e3;
      mouseClickedTile = math2.convertWorldSpaceToCoords_Rounded(mouseWorldLocation);
      mouseClickedPixels = mousePos;
    }
    function executeMouseSimulatedClick() {
      if (!timeMouseDownSeconds) return;
      if (!mouseIsSupported) return;
      const nowSeconds = (/* @__PURE__ */ new Date()).getTime() / 1e3;
      const timePassed = nowSeconds - timeMouseDownSeconds;
      if (timePassed > mouseClickedDelaySeconds) return;
      const dx = mousePos[0] - mouseClickedPixels[0];
      const dy = mousePos[1] - mouseClickedPixels[1];
      const d = Math.hypot(dx, dy);
      if (d > pixelDistToCancelClick) return;
      mouseClicked = true;
    }
    function calcMouseWorldLocation() {
      if (perspective2.isMouseLocked()) return;
      if (input2.isMouseSupported() || input2.isMouseDown_Left()) calcMouseWorldLocation_Mouse();
      else calcMouseWorldLocation_Touch();
    }
    function calcMouseWorldLocation_Mouse() {
      const n = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const halfCanvasWidth = camera2.getCanvasWidthVirtualPixels() / 2;
      const halfCanvasHeight = camera2.getCanvasHeightVirtualPixels() / 2;
      const boundingBoxToUse = options2.isDebugModeOn() ? camera2.getScreenBoundingBox(true) : camera2.getScreenBoundingBox(false);
      const mouseLocationX = n * mousePos[0] / halfCanvasWidth * boundingBoxToUse.right;
      const mouseLocationY = n * mousePos[1] / halfCanvasHeight * boundingBoxToUse.top;
      mouseWorldLocation = [mouseLocationX, mouseLocationY];
    }
    function calcMouseWorldLocation_Touch() {
      if (selection2.isAPieceSelected() && movement.isScaleLess1Pixel_Virtual()) return;
      mouseWorldLocation = [0, 0];
    }
    function calcCrosshairWorldLocation() {
      if (!perspective2.isMouseLocked()) return;
      const rotX = Math.PI / 180 * perspective2.getRotX();
      const rotZ = Math.PI / 180 * perspective2.getRotZ();
      const hyp = -Math.tan(rotX) * camera2.getPosition()[2];
      const x = hyp * Math.sin(rotZ);
      const y = hyp * Math.cos(rotZ);
      mouseWorldLocation = [x, y];
    }
    function addMouseWheel(event2) {
      mouseWheel += event2.deltaY;
    }
    function pushMouseDown(event2) {
      const button = event2.button;
      mouseDowns.push(button);
      if (mouseHelds.indexOf(button) === -1) mouseHelds.push(button);
    }
    function removeMouseHeld(event2) {
      const index = mouseHelds.indexOf(event2.button);
      if (index !== -1) mouseHelds.splice(index, 1);
    }
    function initListeners_Keyboard() {
      document.addEventListener("keydown", (event2) => {
        event2 = event2 || window.event;
        const key = event2.key.toLowerCase();
        keyDowns.push(key);
        if (keyHelds.indexOf(key) === -1) keyHelds.push(key);
        if (event2.key === "Tab") event2.preventDefault();
      });
      document.addEventListener("keyup", (event2) => {
        event2 = event2 || window.event;
        const index = keyHelds.indexOf(event2.key.toLowerCase());
        if (index !== -1) keyHelds.splice(index, 1);
      });
    }
    function resetKeyEvents() {
      touchDowns = [];
      touchClicked = false;
      mouseDowns = [];
      mouseWheel = 0;
      mouseClicked = false;
      keyDowns = [];
      mouseMoved = false;
      ignoreMouseDown = false;
    }
    function touchHeldsIncludesID(touchID) {
      for (let i = 0; i < touchHelds.length; i++) {
        if (touchHelds[i].id === touchID) return true;
      }
      return false;
    }
    function getTouchHeldByID(touchID) {
      for (let i = 0; i < touchHelds.length; i++) {
        if (touchHelds[i].id === touchID) return touchHelds[i];
      }
      console.log("touchHelds does not contain desired touch object!");
    }
    function atleast1TouchDown() {
      return touchDowns.length > 0;
    }
    function atleast1TouchHeld() {
      return touchHelds.length > 0;
    }
    function isMouseDown_Left() {
      return mouseDowns.includes(leftMouseKey);
    }
    function isMouseDown_Right() {
      return mouseDowns.includes(rightMouseKey);
    }
    function removeMouseDown_Left() {
      math2.removeObjectFromArray(mouseDowns, leftMouseKey);
    }
    function isMouseHeld_Left() {
      return mouseHelds.includes(leftMouseKey);
    }
    function isKeyDown(keyName) {
      return keyDowns.includes(keyName);
    }
    function atleast1KeyDown() {
      return keyDowns.length > 0;
    }
    function atleast1KeyHeld() {
      return keyHelds.length > 0;
    }
    function isKeyHeld(keyName) {
      return keyHelds.includes(keyName);
    }
    function atleast1InputThisFrame() {
      return getMouseMoved() || atleast1TouchDown() || atleast1TouchHeld() || atleast1KeyDown();
    }
    function doIgnoreMouseDown(event2) {
      ignoreMouseDown = true;
    }
    function isMouseSupported() {
      return mouseIsSupported;
    }
    function renderMouse() {
      if (mouseIsSupported) return;
      if (!selection2.isAPieceSelected()) return;
      if (!movement.isScaleLess1Pixel_Virtual()) return;
      const [x, y] = mouseWorldLocation;
      const mouseInnerWidthWorld = math2.convertPixelsToWorldSpace_Virtual(mouseInnerWidth);
      const mouseOuterWidthWorld = math2.convertPixelsToWorldSpace_Virtual(mouseOuterWidth);
      const mouseData = bufferdata.getDataRingSolid(x, y, mouseInnerWidthWorld, mouseOuterWidthWorld, 32, 0, 0, 0, mouseOpacity);
      const data32 = new Float32Array(mouseData);
      const model = buffermodel.createModel_Colored(data32, 2, "TRIANGLES");
      model.render();
    }
    function moveMouse(touch1, touch2) {
      if (!selection2.isAPieceSelected() || !movement.isScaleLess1Pixel_Virtual()) {
        setTouchesChangeInXYTo0(touch1);
        if (touch2) setTouchesChangeInXYTo0(touch2);
        return;
      }
      let touchMovementX = math2.convertPixelsToWorldSpace_Virtual(touch1.changeInX);
      let touchMovementY = math2.convertPixelsToWorldSpace_Virtual(touch1.changeInY);
      if (touch2) {
        const touch2movementX = math2.convertPixelsToWorldSpace_Virtual(touch2.changeInX);
        const touch2movementY = math2.convertPixelsToWorldSpace_Virtual(touch2.changeInY);
        touchMovementX = (touchMovementX + touch2movementX) / 2;
        touchMovementY = (touchMovementY + touch2movementY) / 2;
        setTouchesChangeInXYTo0(touch2);
      }
      const oneOrNegOne = onlinegame2.areInOnlineGame() && onlinegame2.areWeColor("black") ? -1 : 1;
      mouseWorldLocation[0] -= touchMovementX * dampeningToMoveMouseInTouchMode * oneOrNegOne;
      mouseWorldLocation[1] -= touchMovementY * dampeningToMoveMouseInTouchMode * oneOrNegOne;
      setTouchesChangeInXYTo0(touch1);
      capMouseDistance();
    }
    function capMouseDistance() {
      const distance = camera2.getScreenBoundingBox().right * percOfScreenMouseCanGo;
      const hyp = Math.hypot(mouseWorldLocation[0], mouseWorldLocation[1]);
      if (hyp < distance) return;
      const ratio = distance / hyp;
      mouseWorldLocation[0] *= ratio;
      mouseWorldLocation[1] *= ratio;
    }
    function setTouchesChangeInXYTo0(touch) {
      touch.changeInX = 0;
      touch.changeInY = 0;
    }
    return Object.freeze({
      getTouchHelds,
      atleast1TouchDown,
      getTouchClicked,
      isMouseDown_Left,
      isMouseDown_Right,
      removeMouseDown_Left,
      getTouchClickedTile,
      getTouchClickedWorld,
      isMouseHeld_Left,
      isKeyDown,
      atleast1KeyHeld,
      isKeyHeld,
      getMouseWheel,
      getMouseClickedTile,
      getMouseClicked,
      getMousePos,
      getMouseMoved,
      doIgnoreMouseDown,
      isMouseSupported,
      initListeners,
      resetKeyEvents,
      touchHeldsIncludesID,
      getTouchHeldByID,
      getMouseWorldLocation,
      atleast1InputThisFrame,
      renderMouse,
      moveMouse
    });
  }();

  // src/client/scripts/game/chess/specialdetect.mjs
  var specialdetect = function() {
    const allSpecials = ["enpassant", "promotion", "castle"];
    function getAllSpecialMoves() {
      return allSpecials;
    }
    function getSpecialMoves() {
      return {
        "kings": kings,
        "royalCentaurs": kings,
        "pawns": pawns
      };
    }
    function kings(gamefile2, coords, color, individualMoves) {
      if (!doesPieceHaveSpecialRight(gamefile2, coords)) return;
      const x = coords[0];
      const y = coords[1];
      const key = organizedlines2.getKeyFromLine([1, 0], coords);
      const row = gamefile2.piecesOrganizedByLines["1,0"][key];
      let leftLegal = true;
      let rightLegal = true;
      let left = -Infinity;
      let right = Infinity;
      for (let i = 0; i < row.length; i++) {
        const thisPiece = row[i];
        const thisCoord = thisPiece.coords;
        if (thisCoord[0] < x && thisCoord[0] > left) left = thisCoord[0];
        else if (thisCoord[0] > x && thisCoord[0] < right) right = thisCoord[0];
      }
      const leftDist = x - left;
      const rightDist = right - x;
      const leftCoord = [left, y];
      const rightCoord = [right, y];
      const leftPieceType = gamefileutility2.getPieceTypeAtCoords(gamefile2, leftCoord);
      const rightPieceType = gamefileutility2.getPieceTypeAtCoords(gamefile2, rightCoord);
      const leftColor = leftPieceType ? math2.getPieceColorFromType(leftPieceType) : void 0;
      const rightColor = rightPieceType ? math2.getPieceColorFromType(rightPieceType) : void 0;
      if (left === -Infinity || leftDist < 3 || !doesPieceHaveSpecialRight(gamefile2, leftCoord) || leftColor !== color || leftPieceType.startsWith("pawns")) leftLegal = false;
      if (right === Infinity || rightDist < 3 || !doesPieceHaveSpecialRight(gamefile2, rightCoord) || rightColor !== color || rightPieceType.startsWith("pawns")) rightLegal = false;
      if (!leftLegal && !rightLegal) return;
      const oppositeColor = math2.getOppositeColor(color);
      if (wincondition.doesColorHaveWinCondition(gamefile2, oppositeColor, "checkmate")) {
        if (gamefile2.inCheck) return;
        const king = gamefileutility2.getPieceAtCoords(gamefile2, coords);
        if (leftLegal) {
          const middleSquare = [x - 1, y];
          if (checkdetection.doesMovePutInCheck(gamefile2, king, middleSquare, color)) leftLegal = false;
        }
        if (rightLegal) {
          const middleSquare = [x + 1, y];
          if (checkdetection.doesMovePutInCheck(gamefile2, king, middleSquare, color)) rightLegal = false;
        }
      }
      if (leftLegal) {
        const specialMove = [coords[0] - 2, coords[1]];
        specialMove.castle = { dir: -1, coord: leftCoord };
        individualMoves.push(specialMove);
      }
      if (rightLegal) {
        const specialMove = [coords[0] + 2, coords[1]];
        specialMove.castle = { dir: 1, coord: rightCoord };
        individualMoves.push(specialMove);
      }
    }
    function pawns(gamefile2, coords, color, individualMoves) {
      const yOneorNegOne = color === "white" ? 1 : -1;
      const coordsInFront = [coords[0], coords[1] + yOneorNegOne];
      if (!gamefileutility2.getPieceTypeAtCoords(gamefile2, coordsInFront)) {
        individualMoves.push(coordsInFront);
        const doublePushCoord = [coordsInFront[0], coordsInFront[1] + yOneorNegOne];
        const pieceAtCoords = gamefileutility2.getPieceTypeAtCoords(gamefile2, doublePushCoord);
        if (!pieceAtCoords && doesPieceHaveSpecialRight(gamefile2, coords)) individualMoves.push(doublePushCoord);
      }
      const coordsToCapture = [
        [coords[0] - 1, coords[1] + yOneorNegOne],
        [coords[0] + 1, coords[1] + yOneorNegOne]
      ];
      for (let i = 0; i < 2; i++) {
        const thisCoordsToCapture = coordsToCapture[i];
        const pieceAtCoords = gamefileutility2.getPieceTypeAtCoords(gamefile2, thisCoordsToCapture);
        if (!pieceAtCoords) continue;
        const colorOfPiece = math2.getPieceColorFromType(pieceAtCoords);
        if (color === colorOfPiece) continue;
        if (pieceAtCoords === "voidsN") continue;
        individualMoves.push(thisCoordsToCapture);
      }
      addPossibleEnPassant(gamefile2, individualMoves, coords, color);
    }
    function addPossibleEnPassant(gamefile2, individualMoves, coords, color) {
      if (!gamefile2.enpassant) return;
      const xLandDiff = gamefile2.enpassant[0] - coords[0];
      const oneOrNegOne = color === "white" ? 1 : -1;
      if (Math.abs(xLandDiff) !== 1) return;
      if (coords[1] + oneOrNegOne !== gamefile2.enpassant[1]) return;
      const captureSquare = [coords[0] + xLandDiff, coords[1] + oneOrNegOne];
      const capturedPieceSquare = [coords[0] + xLandDiff, coords[1]];
      const capturedPieceType = gamefileutility2.getPieceTypeAtCoords(gamefile2, capturedPieceSquare);
      if (!capturedPieceType) return;
      if (color === math2.getPieceColorFromType(capturedPieceType)) return;
      if (gamefileutility2.getPieceTypeAtCoords(gamefile2, captureSquare)) return console.error("We cannot capture onpassant onto a square with an existing piece! " + captureSquare);
      captureSquare.enpassant = -oneOrNegOne;
      individualMoves.push(captureSquare);
    }
    function doesPieceHaveSpecialRight(gamefile2, coords) {
      const key = math2.getKeyFromCoords(coords);
      return gamefile2.specialRights[key];
    }
    function isPawnPromotion(gamefile2, type, coordsClicked) {
      if (!type.startsWith("pawns")) return false;
      if (!gamefile2.gameRules.promotionRanks) return false;
      const color = math2.getPieceColorFromType(type);
      const promotionRank = color === "white" ? gamefile2.gameRules.promotionRanks[0] : color === "black" ? gamefile2.gameRules.promotionRanks[1] : void 0;
      if (coordsClicked[1] === promotionRank) return true;
      return false;
    }
    function transferSpecialFlags_FromCoordsToMove(coords, move) {
      for (const special of allSpecials) {
        if (coords[special]) {
          move[special] = math2.deepCopyObject(coords[special]);
        }
      }
    }
    function transferSpecialFlags_FromMoveToCoords(move, coords) {
      for (const special of allSpecials) {
        if (move[special]) coords[special] = math2.deepCopyObject(move[special]);
      }
    }
    function transferSpecialFlags_FromCoordsToCoords(srcCoords, destCoords) {
      for (const special of allSpecials) {
        if (srcCoords[special] != null) destCoords[special] = math2.deepCopyObject(srcCoords[special]);
      }
    }
    return Object.freeze({
      getAllSpecialMoves,
      getSpecialMoves,
      isPawnPromotion,
      transferSpecialFlags_FromCoordsToMove,
      transferSpecialFlags_FromMoveToCoords,
      transferSpecialFlags_FromCoordsToCoords
    });
  }();

  // src/client/scripts/game/gui/guipromotion.mjs
  var guipromotion = function() {
    const element_Promote = document.getElementById("promote");
    const element_PromoteWhite = document.getElementById("promotewhite");
    const element_PromoteBlack = document.getElementById("promoteblack");
    const element_amazonsW = document.getElementById("amazonsW");
    const element_queensW = document.getElementById("queensW");
    const element_knightridersW = document.getElementById("knightridersW");
    const element_chancellorsW = document.getElementById("chancellorsW");
    const element_archbishopsW = document.getElementById("archbishopsW");
    const element_rooksW = document.getElementById("rooksW");
    const element_bishopsW = document.getElementById("bishopsW");
    const element_rosesW = document.getElementById("rosesW");
    const element_hawksW = document.getElementById("hawksW");
    const element_giraffesW = document.getElementById("giraffesW");
    const element_zebrasW = document.getElementById("zebrasW");
    const element_camelsW = document.getElementById("camelsW");
    const element_centaursW = document.getElementById("centaursW");
    const element_knightsW = document.getElementById("knightsW");
    const element_guardsW = document.getElementById("guardsW");
    const element_amazonsB = document.getElementById("amazonsB");
    const element_queensB = document.getElementById("queensB");
    const element_knightridersB = document.getElementById("knightridersB");
    const element_chancellorsB = document.getElementById("chancellorsB");
    const element_archbishopsB = document.getElementById("archbishopsB");
    const element_rooksB = document.getElementById("rooksB");
    const element_bishopsB = document.getElementById("bishopsB");
    const element_rosesB = document.getElementById("rosesB");
    const element_hawksB = document.getElementById("hawksB");
    const element_giraffesB = document.getElementById("giraffesB");
    const element_zebrasB = document.getElementById("zebrasB");
    const element_camelsB = document.getElementById("camelsB");
    const element_centaursB = document.getElementById("centaursB");
    const element_knightsB = document.getElementById("knightsB");
    const element_guardsB = document.getElementById("guardsB");
    let selectionOpen = false;
    function isUIOpen() {
      return selectionOpen;
    }
    function open(color) {
      selectionOpen = true;
      style.revealElement(element_Promote);
      if (color === "white") {
        style.hideElement(element_PromoteBlack);
        style.revealElement(element_PromoteWhite);
      } else {
        style.hideElement(element_PromoteWhite);
        style.revealElement(element_PromoteBlack);
      }
      initListeners_promotion();
      perspective2.unlockMouse();
    }
    function close() {
      selectionOpen = false;
      style.hideElement(element_Promote);
      closeListeners_promotion();
    }
    function initListeners_promotion() {
      element_amazonsW.addEventListener("click", callback_promote);
      element_queensW.addEventListener("click", callback_promote);
      element_knightridersW.addEventListener("click", callback_promote);
      element_chancellorsW.addEventListener("click", callback_promote);
      element_archbishopsW.addEventListener("click", callback_promote);
      element_rooksW.addEventListener("click", callback_promote);
      element_bishopsW.addEventListener("click", callback_promote);
      element_rosesW.addEventListener("click", callback_promote);
      element_hawksW.addEventListener("click", callback_promote);
      element_giraffesW.addEventListener("click", callback_promote);
      element_zebrasW.addEventListener("click", callback_promote);
      element_camelsW.addEventListener("click", callback_promote);
      element_centaursW.addEventListener("click", callback_promote);
      element_knightsW.addEventListener("click", callback_promote);
      element_guardsW.addEventListener("click", callback_promote);
      element_amazonsB.addEventListener("click", callback_promote);
      element_queensB.addEventListener("click", callback_promote);
      element_knightridersB.addEventListener("click", callback_promote);
      element_chancellorsB.addEventListener("click", callback_promote);
      element_archbishopsB.addEventListener("click", callback_promote);
      element_rooksB.addEventListener("click", callback_promote);
      element_bishopsB.addEventListener("click", callback_promote);
      element_rosesB.addEventListener("click", callback_promote);
      element_hawksB.addEventListener("click", callback_promote);
      element_giraffesB.addEventListener("click", callback_promote);
      element_zebrasB.addEventListener("click", callback_promote);
      element_camelsB.addEventListener("click", callback_promote);
      element_centaursB.addEventListener("click", callback_promote);
      element_knightsB.addEventListener("click", callback_promote);
      element_guardsB.addEventListener("click", callback_promote);
    }
    function closeListeners_promotion() {
      element_amazonsW.removeEventListener("click", callback_promote);
      element_queensW.removeEventListener("click", callback_promote);
      element_knightridersW.removeEventListener("click", callback_promote);
      element_chancellorsW.removeEventListener("click", callback_promote);
      element_archbishopsW.removeEventListener("click", callback_promote);
      element_rooksW.removeEventListener("click", callback_promote);
      element_bishopsW.removeEventListener("click", callback_promote);
      element_rosesW.removeEventListener("click", callback_promote);
      element_hawksW.removeEventListener("click", callback_promote);
      element_giraffesW.removeEventListener("click", callback_promote);
      element_zebrasW.removeEventListener("click", callback_promote);
      element_camelsW.removeEventListener("click", callback_promote);
      element_centaursW.removeEventListener("click", callback_promote);
      element_knightsW.removeEventListener("click", callback_promote);
      element_guardsW.removeEventListener("click", callback_promote);
      element_amazonsB.removeEventListener("click", callback_promote);
      element_queensB.removeEventListener("click", callback_promote);
      element_knightridersB.removeEventListener("click", callback_promote);
      element_chancellorsB.removeEventListener("click", callback_promote);
      element_archbishopsB.removeEventListener("click", callback_promote);
      element_rooksB.removeEventListener("click", callback_promote);
      element_bishopsB.removeEventListener("click", callback_promote);
      element_rosesB.removeEventListener("click", callback_promote);
      element_hawksB.removeEventListener("click", callback_promote);
      element_giraffesB.removeEventListener("click", callback_promote);
      element_zebrasB.removeEventListener("click", callback_promote);
      element_camelsB.removeEventListener("click", callback_promote);
      element_centaursB.removeEventListener("click", callback_promote);
      element_knightsB.removeEventListener("click", callback_promote);
      element_guardsB.removeEventListener("click", callback_promote);
    }
    function initUI(promotionsAllowed) {
      const white = promotionsAllowed.white;
      const black = promotionsAllowed.black;
      if (white.includes("amazons")) style.revealElement(element_amazonsW);
      else style.hideElement(element_amazonsW);
      if (white.includes("queens")) style.revealElement(element_queensW);
      else style.hideElement(element_queensW);
      if (white.includes("knightriders")) style.revealElement(element_knightridersW);
      else style.hideElement(element_knightridersW);
      if (white.includes("chancellors")) style.revealElement(element_chancellorsW);
      else style.hideElement(element_chancellorsW);
      if (white.includes("archbishops")) style.revealElement(element_archbishopsW);
      else style.hideElement(element_archbishopsW);
      if (white.includes("rooks")) style.revealElement(element_rooksW);
      else style.hideElement(element_rooksW);
      if (white.includes("bishops")) style.revealElement(element_bishopsW);
      else style.hideElement(element_bishopsW);
      if (white.includes("roses")) style.revealElement(element_rosesW);
      else style.hideElement(element_rosesW);
      if (white.includes("hawks")) style.revealElement(element_hawksW);
      else style.hideElement(element_hawksW);
      if (white.includes("giraffes")) style.revealElement(element_giraffesW);
      else style.hideElement(element_giraffesW);
      if (white.includes("zebras")) style.revealElement(element_zebrasW);
      else style.hideElement(element_zebrasW);
      if (white.includes("camels")) style.revealElement(element_camelsW);
      else style.hideElement(element_camelsW);
      if (white.includes("centaurs")) style.revealElement(element_centaursW);
      else style.hideElement(element_centaursW);
      if (white.includes("knights")) style.revealElement(element_knightsW);
      else style.hideElement(element_knightsW);
      if (white.includes("guards")) style.revealElement(element_guardsW);
      else style.hideElement(element_guardsW);
      if (black.includes("amazons")) style.revealElement(element_amazonsB);
      else style.hideElement(element_amazonsB);
      if (black.includes("queens")) style.revealElement(element_queensB);
      else style.hideElement(element_queensB);
      if (black.includes("knightriders")) style.revealElement(element_knightridersB);
      else style.hideElement(element_knightridersB);
      if (black.includes("chancellors")) style.revealElement(element_chancellorsB);
      else style.hideElement(element_chancellorsB);
      if (black.includes("archbishops")) style.revealElement(element_archbishopsB);
      else style.hideElement(element_archbishopsB);
      if (black.includes("rooks")) style.revealElement(element_rooksB);
      else style.hideElement(element_rooksB);
      if (black.includes("bishops")) style.revealElement(element_bishopsB);
      else style.hideElement(element_bishopsB);
      if (black.includes("roses")) style.revealElement(element_rosesB);
      else style.hideElement(element_rosesB);
      if (black.includes("hawks")) style.revealElement(element_hawksB);
      else style.hideElement(element_hawksB);
      if (black.includes("giraffes")) style.revealElement(element_giraffesB);
      else style.hideElement(element_giraffesB);
      if (black.includes("zebras")) style.revealElement(element_zebrasB);
      else style.hideElement(element_zebrasB);
      if (black.includes("camels")) style.revealElement(element_camelsB);
      else style.hideElement(element_camelsB);
      if (black.includes("centaurs")) style.revealElement(element_centaursB);
      else style.hideElement(element_centaursB);
      if (black.includes("knights")) style.revealElement(element_knightsB);
      else style.hideElement(element_knightsB);
      if (black.includes("guards")) style.revealElement(element_guardsB);
      else style.hideElement(element_guardsB);
    }
    function callback_promote(event2) {
      event2 = event2 || window.event;
      const type = event2.srcElement.classList[1];
      selection2.promoteToType(type);
      close();
    }
    return Object.freeze({
      isUIOpen,
      open,
      close,
      initUI
    });
  }();

  // src/client/scripts/game/chess/formatconverter.mjs
  var formatconverter2 = function() {
    const pieceDictionary = {
      "kingsW": "K",
      "kingsB": "k",
      "pawnsW": "P",
      "pawnsB": "p",
      "knightsW": "N",
      "knightsB": "n",
      "bishopsW": "B",
      "bishopsB": "b",
      "rooksW": "R",
      "rooksB": "r",
      "queensW": "Q",
      "queensB": "q",
      "amazonsW": "AM",
      "amazonsB": "am",
      "hawksW": "HA",
      "hawksB": "ha",
      "chancellorsW": "CH",
      "chancellorsB": "ch",
      "archbishopsW": "AR",
      "archbishopsB": "ar",
      "guardsW": "GU",
      "guardsB": "gu",
      "camelsW": "CA",
      "camelsB": "ca",
      "giraffesW": "GI",
      "giraffesB": "gi",
      "zebrasW": "ZE",
      "zebrasB": "ze",
      "centaursW": "CE",
      "centaursB": "ce",
      "royalQueensW": "RQ",
      "royalQueensB": "rq",
      "royalCentaursW": "RC",
      "royalCentaursB": "rc",
      "knightridersW": "NR",
      "knightridersB": "nr",
      "obstaclesN": "ob",
      "voidsN": "vo"
    };
    const metadata_key_ordering = [
      "Event",
      "Site",
      "Variant",
      "Round",
      "UTCDate",
      "UTCTime",
      "TimeControl",
      "White",
      "Black",
      "Result",
      "Termination"
    ];
    function invertDictionary(json) {
      const inv = {};
      for (const key in json) {
        inv[json[key]] = key;
      }
      return inv;
    }
    const invertedpieceDictionary = invertDictionary(pieceDictionary);
    function LongToShort_Piece(longpiece) {
      if (!pieceDictionary[longpiece]) throw new Error("Unknown piece type detected: " + longpiece);
      return pieceDictionary[longpiece];
    }
    function ShortToLong_Piece(shortpiece) {
      if (!invertedpieceDictionary[shortpiece]) throw new Error("Unknown piece abbreviation detected: " + shortpiece);
      return invertedpieceDictionary[shortpiece];
    }
    function isJson(str) {
      try {
        JSON.parse(str);
      } catch (e) {
        return false;
      }
      return true;
    }
    function LongToShort_Format(longformat, { compact_moves = 0, make_new_lines = true, specifyPosition = true } = {}) {
      let shortformat = "";
      const whitespace = make_new_lines ? "\n" : " ";
      const metadata_keys_used = {};
      for (const key of metadata_key_ordering) {
        if (longformat.metadata[key]) {
          shortformat += `[${key} "${longformat.metadata[key]}"]${whitespace}`;
          metadata_keys_used[key] = true;
        }
      }
      for (const key in longformat.metadata) {
        if (longformat.metadata[key] && !metadata_keys_used[key]) shortformat += `[${key} "${longformat.metadata[key]}"]${whitespace}`;
      }
      if (longformat.metadata) shortformat += whitespace;
      const turnOrderArray = [];
      if (!longformat.gameRules.turnOrder) throw new Error("turnOrder gamerule MUST be present when compressing a game.");
      for (const color of longformat.gameRules.turnOrder) {
        if (color === "white") turnOrderArray.push("w");
        else if (color === "black") turnOrderArray.push("b");
        else throw new Error(`Invalid color '${color}' when parsing turn order when copying game!`);
      }
      let turn_order = turnOrderArray.join(":");
      if (turn_order === "w:b") turn_order = "w";
      else if (turn_order === "b:w") turn_order = "b";
      shortformat += turn_order + " ";
      if (longformat.enpassant) shortformat += `${longformat.enpassant.toString()} `;
      if (longformat.moveRule) shortformat += `${longformat.moveRule.toString()} `;
      let fullmove = 1;
      if (longformat.fullMove) {
        shortformat += `${longformat.fullMove.toString()} `;
        fullmove = parseInt(longformat.fullMove);
      }
      if (longformat.gameRules) {
        if (longformat.gameRules.promotionRanks) {
          shortformat += "(";
          if (longformat.gameRules.promotionRanks[0] != null) {
            const promotionListWhite = longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed.white : null;
            shortformat += longformat.gameRules.promotionRanks[0];
            if (promotionListWhite) {
              if (!(promotionListWhite.length == 4 && promotionListWhite.includes("rooks") && promotionListWhite.includes("queens") && promotionListWhite.includes("bishops") && promotionListWhite.includes("knights"))) {
                shortformat += ";";
                for (const longpiece of promotionListWhite) {
                  shortformat += `${LongToShort_Piece(longpiece + "W")},`;
                }
                shortformat = shortformat.slice(0, -1);
              }
            }
          }
          shortformat += "|";
          if (longformat.gameRules.promotionRanks[1] != null) {
            const promotionListBlack = longformat.gameRules.promotionsAllowed ? longformat.gameRules.promotionsAllowed.black : null;
            shortformat += longformat.gameRules.promotionRanks[1];
            if (promotionListBlack) {
              if (!(promotionListBlack.length == 4 && promotionListBlack.includes("rooks") && promotionListBlack.includes("queens") && promotionListBlack.includes("bishops") && promotionListBlack.includes("knights"))) {
                shortformat += ";";
                for (const longpiece of promotionListBlack) {
                  shortformat += `${LongToShort_Piece(longpiece + "B")},`;
                }
                shortformat = shortformat.slice(0, -1);
              }
            }
          }
          shortformat += ") ";
        }
      }
      if (longformat.gameRules) {
        if (longformat.gameRules.winConditions) {
          const whitewins = longformat.gameRules.winConditions.white;
          const blackwins = longformat.gameRules.winConditions.black;
          if (whitewins && blackwins) {
            let wins_are_equal = true;
            if (whitewins.length == blackwins.length) {
              for (let i = 0; i < whitewins.length; i++) {
                let white_win_i_is_black_win = false;
                for (let j = 0; j < blackwins.length; j++) {
                  if (whitewins[i] == blackwins[j]) {
                    white_win_i_is_black_win = true;
                    break;
                  }
                }
                if (!white_win_i_is_black_win) wins_are_equal = false;
              }
            } else wins_are_equal = false;
            if (wins_are_equal) {
              if (whitewins.length > 1 || whitewins[0] !== "checkmate") shortformat += `${whitewins.toString()} `;
            } else {
              shortformat += `(${whitewins.toString()}|${blackwins.toString()}) `;
            }
          }
        }
      }
      const excludedGameRules = /* @__PURE__ */ new Set(["promotionRanks", "promotionsAllowed", "winConditions", "turnOrder"]);
      const extraGameRules = {};
      let added_extras = false;
      for (const key in longformat.gameRules) {
        if (excludedGameRules.has(key)) continue;
        extraGameRules[key] = longformat.gameRules[key];
        added_extras = true;
      }
      if (added_extras) shortformat += `${JSON.stringify(extraGameRules)} `;
      if (specifyPosition) {
        if (isStartingPositionInLongFormat(longformat.startingPosition)) {
          shortformat += LongToShort_Position(longformat.startingPosition, longformat.specialRights);
        } else {
          shortformat += longformat.startingPosition;
        }
        if (longformat.moves) shortformat += `${whitespace}${whitespace}`;
      }
      if (longformat.moves) shortformat += longToShortMoves(longformat.moves, { turnOrderArray, fullmove, compact_moves, make_new_lines });
      return shortformat;
    }
    function longToShortMoves(longmoves, { turnOrderArray, fullmove, make_new_lines, compact_moves }) {
      if (typeof longmoves[0] === "string") return longmoves.join("|");
      let turnIndex = 0;
      let shortmoves = "";
      for (let i = 0; i < longmoves.length; i++) {
        const longmove = longmoves[i];
        if (compact_moves === 0) {
          if (turnIndex === 0) {
            shortmoves += !make_new_lines && i !== 0 ? " " : "";
            shortmoves += fullmove + ". ";
          } else shortmoves += " | ";
        } else {
          shortmoves += i === 0 ? "" : "|";
        }
        shortmoves += longmove.type && (compact_moves == 0 || compact_moves == 1) ? LongToShort_Piece(longmove.type) : "";
        shortmoves += longmove.startCoords.toString();
        shortmoves += compact_moves == 0 ? " " : "";
        shortmoves += longmove.captured && (compact_moves == 0 || compact_moves == 1) ? "x" : ">";
        shortmoves += compact_moves == 0 ? " " : "";
        shortmoves += longmove.endCoords.toString();
        shortmoves += compact_moves == 0 ? " " : "";
        if (longmove.promotion) {
          shortmoves += compact_moves == 0 || compact_moves == 1 ? "=" : "";
          shortmoves += LongToShort_Piece(longmove.promotion);
        }
        if (longmove.mate && (compact_moves == 0 || compact_moves == 1)) {
          shortmoves += "#";
        } else if (longmove.check && (compact_moves == 0 || compact_moves == 1)) {
          shortmoves += "+";
        }
        shortmoves = shortmoves.trimEnd();
        turnIndex++;
        if (turnIndex > turnOrderArray.length - 1) {
          turnIndex = 0;
          fullmove += 1;
          if (i !== longmoves.length - 1 && compact_moves === 0) {
            shortmoves += make_new_lines ? "\n" : " |";
          }
        }
      }
      return shortmoves.trimEnd();
    }
    function ShortToLong_Format(shortformat) {
      const longformat = {};
      longformat.gameRules = {};
      const indexOfGameRulesStart = shortformat.indexOf("{");
      if (indexOfGameRulesStart !== -1) {
        const indexOfGameRulesEnd = shortformat.lastIndexOf("}");
        if (indexOfGameRulesEnd === -1) throw new Error("Unclosed extra gamerules!");
        const stringifiedExtraGamerules = shortformat.substring(indexOfGameRulesStart, indexOfGameRulesEnd + 1);
        shortformat = shortformat.substring(0, indexOfGameRulesStart) + shortformat.substring(indexOfGameRulesEnd + 1, shortformat.length);
        if (!isJson(stringifiedExtraGamerules)) throw new Error("Extra optional arguments not in JSON format");
        const parsedGameRules = JSON.parse(stringifiedExtraGamerules);
        Object.assign(longformat.gameRules, parsedGameRules);
      }
      const metadata = {};
      while (shortformat.indexOf("[") > -1) {
        const start_index = shortformat.indexOf("[");
        const end_index = shortformat.indexOf("]");
        if (end_index == -1) throw new Error("Unclosed [ detected");
        const metadatastring = shortformat.slice(start_index + 1, end_index);
        shortformat = `${shortformat.slice(0, start_index)}${shortformat.slice(end_index + 1)}`;
        if (/^[^\s\:]*\s+\"/.test(metadatastring)) {
          const split_index = metadatastring.search(/\s\"/);
          metadata[metadatastring.slice(0, split_index)] = metadatastring.slice(split_index + 2, -1);
        } else {
          const split_index = metadatastring.indexOf(": ");
          if (split_index > -1) metadata[metadatastring.slice(0, split_index)] = metadatastring.slice(split_index + 2);
          else metadata[metadatastring] = "";
        }
      }
      longformat.metadata = metadata;
      while (shortformat != "") {
        if (/\s/.test(shortformat[0])) {
          shortformat = shortformat.slice(1);
          continue;
        }
        let index = shortformat.search(/\s/);
        if (index == -1) index = shortformat.length;
        let string = shortformat.slice(0, index);
        shortformat = shortformat.slice(index + 1);
        if (!longformat.gameRules.turnOrder && /^[a-z](:[a-z])*$/.test(string)) {
          if (string === "w") string = "w:b";
          else if (string === "b") string = "b:w";
          const turnOrderArray = string.split(":");
          const turnOrder = [];
          for (const colorAbbrev of turnOrderArray) {
            if (colorAbbrev === "w") turnOrder.push("white");
            else if (colorAbbrev === "b") turnOrder.push("black");
            else throw new Error(`Unknown color abbreviation "${colorAbbrev}" when parsing turn order while pasting game!`);
          }
          longformat.gameRules.turnOrder = turnOrder;
          continue;
        }
        if (!longformat.enpassant && /^(-?[0-9]+,-?[0-9]+)$/.test(string)) {
          longformat.enpassant = [parseInt(string.split(",")[0]), parseInt(string.split(",")[1])];
          continue;
        }
        if (!longformat.moveRule && /^([0-9]+\/[0-9]+)$/.test(string)) {
          longformat.moveRule = string;
          continue;
        }
        if (!longformat.fullMove && /^([0-9]+)$/.test(string)) {
          longformat.fullMove = parseInt(string);
          continue;
        }
        if (/^\(((()|([^\(\)\|]*\|)-?[0-9]+)|(\|\)$))/.test(string)) {
          if (!longformat.gameRules.promotionRanks) {
            string = string.replace(/[\(\)]+/g, "").split("|");
            if (string.length !== 2) throw new Error("Promotion ranks needs exactly 2 values");
            longformat.gameRules.promotionRanks = [];
            longformat.gameRules.promotionsAllowed = { white: [], black: [] };
            for (let i = 0; i < 2; i++) {
              const color = i == 0 ? "white" : "black";
              if (string[i] != "" && string[i] != null) {
                const promotionLine = string[i].indexOf(";") == -1 ? parseInt(string[i]) : parseInt(string[i].split(";")[0]);
                if (isNaN(promotionLine)) throw new Error("Promotion rank is NaN");
                longformat.gameRules.promotionRanks.push(promotionLine);
                string[i] = string[i].split(";");
                if (string[i].length == 1) {
                  longformat.gameRules.promotionsAllowed[color] = ["queens", "rooks", "bishops", "knights"];
                } else {
                  longformat.gameRules.promotionsAllowed[color] = [];
                  for (const promotionpiece of string[i][1].split(",")) {
                    longformat.gameRules.promotionsAllowed[color].push(ShortToLong_Piece(promotionpiece).slice(0, -1));
                  }
                }
              } else {
                longformat.gameRules.promotionRanks.push(void 0);
              }
            }
            continue;
          }
        }
        if (/^(\(?[a-zA-z][^0-9]+)$/.test(string)) {
          if (!longformat.gameRules.winConditions) {
            longformat.gameRules.winConditions = {};
            string = string.replace(/[\(\)]/g, "").split("|");
            if (string.length == 1) string.push(string[0]);
            for (let i = 0; i < 2; i++) {
              const color = i == 0 ? "white" : "black";
              longformat.gameRules.winConditions[color] = [];
              for (const wincon of string[i].split(",")) {
                longformat.gameRules.winConditions[color].push(wincon);
              }
            }
            continue;
          }
        }
        if (!longformat.startingPosition && /^([a-zA-z]+-?[0-9]+,-?[0-9]+\+?($|\|))/.test(string)) {
          const { startingPosition, specialRights } = getStartingPositionAndSpecialRightsFromShortPosition(string);
          longformat.specialRights = specialRights;
          longformat.startingPosition = startingPosition;
          longformat.shortposition = string;
          continue;
        }
        if (/^(([0-9]+\.)|([a-zA-Z]*-?[0-9]+,-?[0-9]+[\s]*(x|>)+))/.test(string)) {
          const shortmoves = (string + "  " + shortformat).trimEnd();
          const moves = convertShortMovesToLong(shortmoves);
          if (moves.length > 0) longformat.moves = moves;
          if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { white: ["checkmate"], black: ["checkmate"] };
          return longformat;
        }
      }
      if (!longformat.gameRules.winConditions) longformat.gameRules.winConditions = { white: ["checkmate"], black: ["checkmate"] };
      return longformat;
    }
    function convertShortMovesToLong(shortmoves) {
      const longmoves = [];
      shortmoves.replace(/[\!\?=]/g, "");
      while (shortmoves.indexOf("{") > -1) {
        const start_index = shortmoves.indexOf("{");
        const end_index = shortmoves.indexOf("}");
        if (end_index == -1) throw new Error("Unclosed { found.");
        shortmoves = shortmoves.slice(0, start_index) + "|" + shortmoves.slice(end_index + 1);
      }
      shortmoves = shortmoves.match(/[a-zA-Z]*-?[0-9]+,-?[0-9]+[\s]*(x|>)+[\s]*-?[0-9]+,-?[0-9]+[^\|\.0-9]*/g);
      if (!shortmoves) return longmoves;
      for (let i = 0; i < shortmoves.length; i++) {
        const coords = shortmoves[i].match(/-?[0-9]+,-?[0-9]+/g);
        const startString = coords[0];
        const endString = coords[1];
        const suffix_index = shortmoves[i].lastIndexOf(endString) + endString.length;
        const suffix = shortmoves[i].slice(suffix_index).trimStart().trimEnd();
        const promotedPiece = /[a-zA-Z]+/.test(suffix) ? suffix.match(/[a-zA-Z]+/) : "";
        longmoves.push(`${startString}>${endString}${promotedPiece}`);
      }
      return longmoves;
    }
    function GameToPosition(longformat, halfmoves = 0, modify_input = false) {
      if (typeof longformat.startingPosition === "string") throw new Error("startingPosition must be in json format!");
      if (!longformat.moves || longformat.moves.length === 0) return longformat;
      const ret = modify_input ? longformat : deepCopyObject(longformat);
      let enpassantcoordinates = ret.enpassant ? ret.enpassant : "";
      ret.fullMove = longformat.fullMove + Math.floor(ret.moves.length / longformat.gameRules.turnOrder.length);
      for (let i = 0; i < Math.min(halfmoves, ret.moves.length); i++) {
        const move = ret.moves[i];
        const startString = move.startCoords.toString();
        const endString = move.endCoords.toString();
        if (move.promotion) {
          ret.startingPosition[endString] = `${move.promotion}`;
        } else {
          ret.startingPosition[endString] = `${ret.startingPosition[startString]}`;
        }
        delete ret.startingPosition[startString];
        if (ret.specialRights) {
          delete ret.specialRights[startString];
          delete ret.specialRights[endString];
        }
        if (ret.moveRule) {
          const slashindex = ret.moveRule.indexOf("/");
          if (move.captured || move.type.slice(0, -1) == "pawns") {
            ret.moveRule = `0/${ret.moveRule.slice(slashindex + 1)}`;
          } else {
            ret.moveRule = `${(parseInt(ret.moveRule.slice(0, slashindex)) + 1).toString()}/${ret.moveRule.slice(slashindex + 1)}`;
          }
        }
        if (move.enpassant) {
          delete ret.startingPosition[enpassantcoordinates];
          if (ret.specialRights) delete ret.specialRights[enpassantcoordinates];
        }
        if (move.type.slice(0, -1) == "pawns" && Math.abs(move.startCoords[1] - move.endCoords[1]) > 1) {
          ret.enpassant = [move.endCoords[0], Math.round(0.5 * (move.startCoords[1] + move.endCoords[1]))];
        } else {
          delete ret.enpassant;
        }
        if (move.castle) {
          const castleString = move.castle.coord[0].toString() + "," + move.castle.coord[1].toString();
          ret.startingPosition[`${(parseInt(move.endCoords[0]) - move.castle.dir).toString()},${move.endCoords[1].toString()}`] = `${ret.startingPosition[castleString]}`;
          delete ret.startingPosition[castleString];
          if (ret.specialRights) delete ret.specialRights[castleString];
        }
        enpassantcoordinates = endString;
      }
      delete ret.moves;
      ret.moves = [];
      return ret;
    }
    function LongToShort_CompactMove(longmove) {
      const promotedPiece = longmove.promotion ? LongToShort_Piece(longmove.promotion) : "";
      return `${longmove.startCoords.toString()}>${longmove.endCoords.toString()}${promotedPiece}`;
    }
    function ShortToLong_CompactMove(shortmove) {
      let coords = shortmove.match(/-?[0-9]+,-?[0-9]+/g);
      if (coords.length !== 2) throw new Error(`Short move does not contain 2 valid coordinates: ${JSON.stringify(coords)}`);
      coords = coords.map((movestring) => {
        return getCoordsFromString(movestring);
      });
      coords.forEach((coords2) => {
        if (!isFinite(coords2[0])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords2}`);
        if (!isFinite(coords2[1])) throw new Error(`Move coordinate must not be Infinite. coords: ${coords2}`);
      });
      const promotedPiece = /[a-zA-Z]+/.test(shortmove) ? ShortToLong_Piece(shortmove.match(/[a-zA-Z]+/)) : "";
      const longmove = { compact: shortmove };
      longmove.startCoords = coords[0];
      longmove.endCoords = coords[1];
      if (promotedPiece != "") {
        longmove.promotion = promotedPiece;
      }
      return longmove;
    }
    function LongToShort_Position(position, specialRights = {}) {
      let shortposition = "";
      if (!position) return shortposition;
      for (const coordinate in position) {
        if (specialRights[coordinate]) {
          shortposition += `${LongToShort_Piece(position[coordinate])}${coordinate}+|`;
        } else {
          shortposition += `${LongToShort_Piece(position[coordinate])}${coordinate}|`;
        }
      }
      if (shortposition.length != 0) shortposition = shortposition.slice(0, -1);
      return shortposition;
    }
    function LongToShort_Position_FromGamerules(position, pawnDoublePush, castleWith) {
      const specialRights = generateSpecialRights(position, pawnDoublePush, castleWith);
      return LongToShort_Position(position, specialRights);
    }
    function generateSpecialRights(position, pawnDoublePush, castleWith) {
      const specialRights = {};
      const kingsFound = {};
      const castleWithsFound = {};
      for (const key in position) {
        const thisPiece = position[key];
        if (pawnDoublePush && thisPiece.startsWith("pawns")) specialRights[key] = true;
        else if (castleWith && thisPiece.startsWith("kings")) {
          specialRights[key] = true;
          kingsFound[key] = getPieceColorFromType(thisPiece);
        } else if (castleWith && thisPiece.startsWith(castleWith)) {
          castleWithsFound[key] = getPieceColorFromType(thisPiece);
        }
      }
      if (Object.keys(kingsFound).length === 0) return specialRights;
      outerFor: for (const coord in castleWithsFound) {
        const coords = getCoordsFromString(coord);
        for (const kingCoord in kingsFound) {
          const kingCoords = getCoordsFromString(kingCoord);
          if (coords[1] !== kingCoords[1]) continue;
          if (castleWithsFound[coord] !== kingsFound[kingCoord]) continue;
          const xDist = Math.abs(coords[0] - kingCoords[0]);
          if (xDist < 3) continue;
          specialRights[coord] = true;
          continue outerFor;
        }
      }
      return specialRights;
    }
    function getCoordsFromString(key) {
      return key.split(",").map(Number);
    }
    function getPieceColorFromType(type) {
      if (type.endsWith("W")) return "white";
      else if (type.endsWith("B")) return "black";
      else if (type.endsWith("N")) return "neutral";
      else throw new Error(`Cannot get color of piece with type "${type}"!`);
    }
    function getStartingPositionAndSpecialRightsFromShortPosition(shortposition) {
      const startingPosition = {};
      const specialRights = {};
      const letter_regex = /[a-zA-Z]/;
      const MAX_INDEX = shortposition.length - 1;
      let index = 0;
      let end_index = 0;
      while (index < MAX_INDEX) {
        let shortpiece = shortposition[index];
        let piecelength = 1;
        while (true) {
          const current_char = shortposition[index + piecelength];
          if (letter_regex.test(current_char)) {
            shortpiece += current_char;
            piecelength++;
          } else {
            break;
          }
        }
        end_index = shortposition.slice(index).search(/\+|\|/);
        if (end_index != -1) {
          if (shortposition[index + end_index] == "+") {
            const coordString = shortposition.slice(index + piecelength, index + end_index);
            startingPosition[coordString] = ShortToLong_Piece(shortpiece);
            specialRights[coordString] = true;
            index += end_index + 2;
          } else {
            startingPosition[shortposition.slice(index + piecelength, index + end_index)] = ShortToLong_Piece(shortpiece);
            index += end_index + 1;
          }
        } else {
          if (shortposition.slice(-1) == "+") {
            const coordString = shortposition.slice(index + piecelength, -1);
            startingPosition[coordString] = ShortToLong_Piece(shortpiece);
            specialRights[coordString] = true;
            index = MAX_INDEX;
          } else {
            startingPosition[shortposition.slice(index + piecelength)] = ShortToLong_Piece(shortpiece);
            index = MAX_INDEX;
          }
        }
      }
      return { startingPosition, specialRights };
    }
    function isStartingPositionInLongFormat(startingPosition) {
      return typeof startingPosition !== "string";
    }
    function deepCopyObject(src) {
      if (typeof src !== "object" || src === null) return src;
      const copy = Array.isArray(src) ? [] : {};
      for (const key in src) {
        const value = src[key];
        copy[key] = deepCopyObject(value);
      }
      return copy;
    }
    return Object.freeze({
      LongToShort_Format,
      ShortToLong_Format,
      GameToPosition,
      LongToShort_CompactMove,
      ShortToLong_CompactMove,
      LongToShort_Position,
      LongToShort_Position_FromGamerules,
      getStartingPositionAndSpecialRightsFromShortPosition,
      generateSpecialRights,
      convertShortMovesToLong,
      longToShortMoves
    });
  }();

  // src/client/scripts/game/chess/selection.mjs
  var selection2 = function() {
    let pieceSelected;
    let legalMoves;
    let isOpponentPiece = false;
    let isPremove = false;
    let hoverSquare;
    let hoverSquareLegal = false;
    let pawnIsPromoting = false;
    let promoteTo;
    function getPieceSelected() {
      return pieceSelected;
    }
    function isAPieceSelected() {
      return pieceSelected !== void 0;
    }
    function isOpponentPieceSelected() {
      return isOpponentPiece;
    }
    function arePremoving() {
      return isPremove;
    }
    function getLegalMovesOfSelectedPiece() {
      return legalMoves;
    }
    function isPawnCurrentlyPromoting() {
      return pawnIsPromoting;
    }
    function promoteToType(type) {
      promoteTo = type;
    }
    function update() {
      const gamefile2 = game2.getGamefile();
      if (input2.isMouseDown_Right()) return unselectPiece();
      if (pawnIsPromoting) {
        if (promoteTo) makePromotionMove();
        return;
      }
      if (movement.isScaleLess1Pixel_Virtual() || transition2.areWeTeleporting() || gamefile2.gameConclusion || guipause2.areWePaused() || perspective2.isLookingUp()) return;
      const touchClickedTile = input2.getTouchClickedTile();
      hoverSquare = input2.getTouchClicked() ? [touchClickedTile.x, touchClickedTile.y] : input2.getMouseClicked() ? input2.getMouseClickedTile() : board2.gtile_MouseOver_Int();
      if (!hoverSquare) return;
      updateHoverSquareLegal();
      if (!input2.getMouseClicked() && !input2.getTouchClicked()) return;
      const pieceClickedType = gamefileutility2.getPieceTypeAtCoords(gamefile2, hoverSquare);
      if (pieceSelected) handleMovingSelectedPiece(hoverSquare, pieceClickedType);
      else if (pieceClickedType) handleSelectingPiece(pieceClickedType);
    }
    function handleMovingSelectedPiece(coordsClicked, pieceClickedType) {
      const gamefile2 = game2.getGamefile();
      tag: if (pieceClickedType) {
        if (math2.areCoordsEqual(pieceSelected.coords, coordsClicked)) {
          unselectPiece();
        } else if (hoverSquareLegal) {
          break tag;
        } else if (pieceClickedType !== "voidsN") {
          handleSelectingPiece(pieceClickedType);
        }
        return;
      }
      if (!hoverSquareLegal) return;
      if (isPremove) throw new Error("Don't know how to premove yet! Will not submit move normally.");
      if (gamefile2.mesh.locked) return statustext2.pleaseWaitForTask();
      if (specialdetect.isPawnPromotion(gamefile2, pieceSelected.type, coordsClicked)) {
        const color = math2.getPieceColorFromType(pieceSelected.type);
        guipromotion.open(color);
        pawnIsPromoting = coordsClicked;
        return;
      }
      moveGamefilePiece(coordsClicked);
    }
    function handleSelectingPiece(pieceClickedType) {
      const gamefile2 = game2.getGamefile();
      if (!movesscript2.areWeViewingLatestMove(gamefile2)) {
        return movepiece.forwardToFront(gamefile2, { flipTurn: false, updateProperties: false });
      }
      if (hoverSquareLegal) return;
      const clickedPieceColor = math2.getPieceColorFromType(pieceClickedType);
      if (!options2.getEM() && clickedPieceColor === "neutral") return;
      if (pieceClickedType === "voidsN") return;
      const clickedPieceIndex = gamefileutility2.getPieceIndexByTypeAndCoords(gamefile2, pieceClickedType, hoverSquare);
      selectPiece(pieceClickedType, clickedPieceIndex, hoverSquare);
    }
    function selectPiece(type, index, coords) {
      main2.renderThisFrame();
      pieceSelected = { type, index, coords };
      legalMoves = legalmoves.calculate(game2.getGamefile(), pieceSelected);
      const pieceColor = math2.getPieceColorFromType(pieceSelected.type);
      isOpponentPiece = onlinegame2.areInOnlineGame() ? pieceColor !== onlinegame2.getOurColor() : pieceColor !== game2.getGamefile().whosTurn;
      isPremove = !isOpponentPiece && onlinegame2.areInOnlineGame() && !onlinegame2.isItOurTurn();
      highlights.regenModel();
    }
    function reselectPiece() {
      if (!pieceSelected) return;
      const gamefile2 = game2.getGamefile();
      const pieceTypeOnCoords = gamefileutility2.getPieceTypeAtCoords(gamefile2, pieceSelected.coords);
      if (pieceTypeOnCoords !== pieceSelected.type) {
        unselectPiece();
        return;
      }
      if (game2.getGamefile().gameConclusion) return;
      const newIndex = gamefileutility2.getPieceIndexByTypeAndCoords(gamefile2, pieceSelected.type, pieceSelected.coords);
      selectPiece(pieceSelected.type, newIndex, pieceSelected.coords);
    }
    function unselectPiece() {
      pieceSelected = void 0;
      isOpponentPiece = false;
      isPremove = false;
      legalMoves = void 0;
      pawnIsPromoting = false;
      promoteTo = void 0;
      guipromotion.close();
      main2.renderThisFrame();
    }
    function moveGamefilePiece(coords) {
      const strippedCoords = movepiece.stripSpecialMoveTagsFromCoords(coords);
      const move = { type: pieceSelected.type, startCoords: pieceSelected.coords, endCoords: strippedCoords };
      specialdetect.transferSpecialFlags_FromCoordsToMove(coords, move);
      const compact = formatconverter2.LongToShort_CompactMove(move);
      move.compact = compact;
      movepiece.makeMove(game2.getGamefile(), move);
      onlinegame2.sendMove();
      unselectPiece();
    }
    function makePromotionMove() {
      const coords = pawnIsPromoting;
      coords.promotion = promoteTo;
      moveGamefilePiece(coords);
      perspective2.relockMouse();
    }
    function updateHoverSquareLegal() {
      if (!pieceSelected) {
        hoverSquareLegal = false;
        return;
      }
      const gamefile2 = game2.getGamefile();
      const typeAtHoverCoords = gamefileutility2.getPieceTypeAtCoords(gamefile2, hoverSquare);
      const hoverSquareIsSameColor = typeAtHoverCoords && math2.getPieceColorFromType(pieceSelected.type) === math2.getPieceColorFromType(typeAtHoverCoords);
      const hoverSquareIsVoid = !hoverSquareIsSameColor && typeAtHoverCoords === "voidsN";
      const selectionColorAgreesWithMoveTurn = math2.getPieceColorFromType(pieceSelected.type) === gamefile2.whosTurn;
      hoverSquareLegal = selectionColorAgreesWithMoveTurn && !isOpponentPiece && legalmoves.checkIfMoveLegal(legalMoves, pieceSelected.coords, hoverSquare) || options2.getEM() && !hoverSquareIsVoid && !hoverSquareIsSameColor;
    }
    function renderGhostPiece() {
      if (!isAPieceSelected() || !hoverSquare || !hoverSquareLegal || !input2.isMouseSupported() || main2.videoMode) return;
      pieces.renderGhostPiece(pieceSelected.type, hoverSquare);
    }
    return Object.freeze({
      isAPieceSelected,
      getPieceSelected,
      reselectPiece,
      unselectPiece,
      getLegalMovesOfSelectedPiece,
      isPawnCurrentlyPromoting,
      promoteToType,
      update,
      renderGhostPiece,
      isOpponentPieceSelected,
      arePremoving
    });
  }();

  // src/client/scripts/game/gui/gui.mjs
  var gui = function() {
    let screen = "";
    const element_overlay = document.getElementById("overlay");
    element_overlay.addEventListener("click", callback_CancelPromotionIfUIOpen);
    function callback_CancelPromotionIfUIOpen(event2) {
      event2 = event2 || window.event;
      if (!guipromotion.isUIOpen()) return;
      selection2.unselectPiece();
      main2.renderThisFrame();
    }
    function getScreen() {
      return screen;
    }
    function setScreen(value) {
      screen = value;
    }
    function fadeInOverlay1s() {
      style.fadeIn1s(element_overlay);
    }
    function callback_featurePlanned() {
      statustext.showStatus(translations["planned_feature"]);
    }
    function makeOverlayUnselectable() {
      element_overlay.classList.add("unselectable");
    }
    function makeOverlaySelectable() {
      element_overlay.classList.remove("unselectable");
    }
    return Object.freeze({
      fadeInOverlay1s,
      getScreen,
      setScreen,
      callback_featurePlanned,
      makeOverlayUnselectable,
      makeOverlaySelectable
    });
  }();

  // src/client/scripts/game/gui/guiguide.mjs
  var guiguide = function() {
    const element_Guide = document.getElementById("guide");
    const element_Back = document.getElementById("guide-back");
    const element_FairyImg = document.getElementById("fairy-pieces");
    const element_FairyCard = document.getElementById("fairy-card");
    const element_FairyBack = document.getElementById("fairy-back");
    const element_FairyForward = document.getElementById("fairy-forward");
    let fairyIndex = 0;
    const maxFairyIndex = element_FairyImg.querySelectorAll("picture").length - 1;
    function open() {
      style.revealElement(element_Guide);
      initListeners();
      loadAllImages();
    }
    function close() {
      style.hideElement(element_Guide);
      closeListeners();
    }
    function initListeners() {
      element_Back.addEventListener("click", callback_Back);
      element_FairyBack.addEventListener("click", callback_FairyBack);
      element_FairyForward.addEventListener("click", callback_FairyForward);
    }
    function closeListeners() {
      element_Back.removeEventListener("click", callback_Back);
      element_FairyBack.removeEventListener("click", callback_FairyBack);
      element_FairyForward.removeEventListener("click", callback_FairyForward);
    }
    function loadAllImages() {
      const images = element_Guide.querySelectorAll("picture > img[loading]");
      images.forEach((img) => {
        img.removeAttribute("loading");
      });
    }
    function callback_Back() {
      close();
      guititle.open();
    }
    function callback_FairyBack(event2) {
      event2 = event2 || window.event;
      if (fairyIndex === 0) return;
      hideCurrentFairy();
      fairyIndex--;
      revealCurrentFairy();
      updateArrowTransparency();
    }
    function callback_FairyForward(event2) {
      event2 = event2 || window.event;
      if (fairyIndex === maxFairyIndex) return;
      hideCurrentFairy();
      fairyIndex++;
      revealCurrentFairy();
      updateArrowTransparency();
    }
    function hideCurrentFairy() {
      const allFairyImgs = element_FairyImg.querySelectorAll("picture");
      const targetFairyImg = allFairyImgs[fairyIndex];
      style.hideElement(targetFairyImg);
      const allFairyCards = element_FairyCard.querySelectorAll(".fairy-card-desc");
      const targetFairyCard = allFairyCards[fairyIndex];
      style.hideElement(targetFairyCard);
    }
    function revealCurrentFairy() {
      const allFairyImgs = element_FairyImg.querySelectorAll("picture");
      const targetFairyImg = allFairyImgs[fairyIndex];
      style.revealElement(targetFairyImg);
      const allFairyCards = element_FairyCard.querySelectorAll(".fairy-card-desc");
      const targetFairyCard = allFairyCards[fairyIndex];
      style.revealElement(targetFairyCard);
    }
    function updateArrowTransparency() {
      if (fairyIndex === 0) element_FairyBack.classList.add("opacity-0_25");
      else element_FairyBack.classList.remove("opacity-0_25");
      if (fairyIndex === maxFairyIndex) element_FairyForward.classList.add("opacity-0_25");
      else element_FairyForward.classList.remove("opacity-0_25");
    }
    return Object.freeze({
      open,
      close
    });
  }();

  // src/client/scripts/game/rendering/animation.mjs
  var animation = function() {
    const z = 0.01;
    const timeToPlaySoundEarly = 100;
    const maxDistB4Teleport = 80;
    const animations = [];
    const moveAnimationDuration = {
      /** The base amount of duration, in millis. */
      baseMillis: 150,
      /** The multiplier amount of duration, in millis, multiplied by the capped move distance. */
      multiplierMillis: 6
    };
    function animatePiece(type, startCoords, endCoords, captured, resetAnimations = true) {
      if (resetAnimations) clearAnimations();
      const dist = math2.chebyshevDistance(startCoords, endCoords);
      const distIsGreater = dist > maxDistB4Teleport;
      const newAnimation = {
        startTime: performance.now(),
        soundPlayed: false,
        type,
        startCoords,
        endCoords,
        captured,
        dist,
        distIsGreater,
        duration: getDurationMillisOfMoveAnimation({ startCoords, endCoords })
      };
      const timeToPlaySound = newAnimation.duration - timeToPlaySoundEarly;
      newAnimation.soundTimeoutID = setTimeout(playAnimationsSound, timeToPlaySound, newAnimation);
      animations.push(newAnimation);
    }
    function getDurationMillisOfMoveAnimation(move) {
      const dist = math2.chebyshevDistance(move.startCoords, move.endCoords);
      const cappedDist = Math.min(dist, maxDistB4Teleport);
      const additionMillis = moveAnimationDuration.multiplierMillis * cappedDist;
      return moveAnimationDuration.baseMillis + additionMillis;
    }
    function clearAnimations() {
      for (const animation2 of animations) {
        clearTimeout(animation2.soundTimeoutID);
        if (!animation2.soundPlayed) playAnimationsSound(animation2, true);
      }
      animations.length = 0;
    }
    function update() {
      if (animations.length === 0) return;
      main2.renderThisFrame();
      for (let i = animations.length - 1; i >= 0; i--) {
        const thisAnimation = animations[i];
        const passedTime = performance.now() - thisAnimation.startTime;
        if (passedTime > thisAnimation.duration) animations.splice(i, 1);
      }
    }
    function playAnimationsSound(animation2, dampen) {
      if (animation2.captured) sound.playSound_capture(animation2.dist, dampen);
      else sound.playSound_move(animation2.dist, dampen);
      animation2.soundPlayed = true;
    }
    function renderTransparentSquares() {
      if (animations.length === 0) return;
      const transparentModel = genTransparentModel();
      transparentModel.render();
    }
    function renderPieces() {
      if (animations.length === 0) return;
      const pieceModel = genPieceModel();
      pieceModel.render();
    }
    function genTransparentModel() {
      const data = [];
      const color = [0, 0, 0, 0];
      for (const thisAnimation of animations) {
        data.push(...getDataOfSquare3D(thisAnimation.endCoords, color));
      }
      return buffermodel.createModel_Colored(new Float32Array(data), 3, "TRIANGLES");
    }
    function getDataOfSquare3D(coords, color) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const startX = (coords[0] - boardPos[0] - board2.gsquareCenter()) * boardScale;
      const startY = (coords[1] - boardPos[1] - board2.gsquareCenter()) * boardScale;
      const endX = startX + 1 * boardScale;
      const endY = startY + 1 * boardScale;
      const [r, g, b, a] = color;
      return [
        //      Vertex              Color
        startX,
        startY,
        z,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        r,
        g,
        b,
        a,
        endX,
        startY,
        z,
        r,
        g,
        b,
        a,
        startX,
        endY,
        z,
        r,
        g,
        b,
        a,
        endX,
        endY,
        z,
        r,
        g,
        b,
        a
      ];
    }
    function genPieceModel() {
      const data = [];
      for (const thisAnimation of animations) {
        const passedTime = performance.now() - thisAnimation.startTime;
        const equaX = passedTime / thisAnimation.duration;
        const equaY = -0.5 * Math.cos(equaX * Math.PI) + 0.5;
        let diffX = thisAnimation.endCoords[0] - thisAnimation.startCoords[0];
        let diffY = thisAnimation.endCoords[1] - thisAnimation.startCoords[1];
        const dist = thisAnimation.dist;
        let newX;
        let newY;
        if (!thisAnimation.distIsGreater) {
          const addX = diffX * equaY;
          const addY = diffY * equaY;
          newX = thisAnimation.startCoords[0] + addX;
          newY = thisAnimation.startCoords[1] + addY;
        } else {
          const firstHalf = equaX < 0.5;
          const neg = firstHalf ? 1 : -1;
          const actualEquaY = firstHalf ? equaY : 1 - equaY;
          const ratio = maxDistB4Teleport / dist;
          diffX *= ratio;
          diffY *= ratio;
          const target = firstHalf ? thisAnimation.startCoords : thisAnimation.endCoords;
          const addX = diffX * actualEquaY * neg;
          const addY = diffY * actualEquaY * neg;
          newX = target[0] + addX;
          newY = target[1] + addY;
        }
        const newCoords = [newX, newY];
        if (thisAnimation.captured) appendDataOfPiece3D(data, thisAnimation.captured.type, thisAnimation.captured.coords);
        appendDataOfPiece3D(data, thisAnimation.type, newCoords);
      }
      return buffermodel.createModel_ColorTextured(new Float32Array(data), 3, "TRIANGLES", pieces.getSpritesheet());
    }
    function appendDataOfPiece3D(data, type, coords) {
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation);
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const startX = (coords[0] - boardPos[0] - board2.gsquareCenter()) * boardScale;
      const startY = (coords[1] - boardPos[1] - board2.gsquareCenter()) * boardScale;
      const endX = startX + 1 * boardScale;
      const endY = startY + 1 * boardScale;
      const { r, g, b, a } = options2.getColorOfType(type);
      const bufferData = bufferdata.getDataQuad_ColorTexture3D(startX, startY, endX, endY, z, texStartX, texStartY, texEndX, texEndY, r, g, b, a);
      data.push(...bufferData);
    }
    return Object.freeze({
      animatePiece,
      update,
      renderTransparentSquares,
      renderPieces,
      getDurationMillisOfMoveAnimation
    });
  }();

  // src/client/scripts/game/chess/specialundo.mjs
  var specialundo = {
    // This returns the functions for undo'ing special moves.
    // In the future, parameters can be added if variants have
    // different special moves for pieces.
    getFunctions() {
      return {
        "kings": specialundo.kings,
        "royalCentaurs": specialundo.kings,
        "pawns": specialundo.pawns
      };
    },
    // A custom special move needs to be able to:
    // * Delete a custom piece
    // * Move a custom piece
    // * Add a custom piece
    // ALL FUNCTIONS NEED TO:
    // * Make the move
    // * Animate the piece
    // Called when the moved piece to undo is a king
    // Tests if the move contains "castle" special move, if so it undos it!
    // RETURNS FALSE if no special move was detected!
    kings(gamefile2, move, { updateData = true, animate = true } = {}) {
      const specialTag = move.castle;
      if (!specialTag) return false;
      let movedPiece = gamefileutility2.getPieceAtCoords(gamefile2, move.endCoords);
      movepiece.movePiece(gamefile2, movedPiece, move.startCoords, { updateData });
      const kingCoords = movedPiece.coords;
      const castledPieceCoords = [kingCoords[0] - specialTag.dir, kingCoords[1]];
      movedPiece = gamefileutility2.getPieceAtCoords(gamefile2, castledPieceCoords);
      movepiece.movePiece(gamefile2, movedPiece, specialTag.coord, { updateData });
      if (!updateData) {
        const key = math.getKeyFromCoords(specialTag.coord);
        gamefile2.specialRights[key] = true;
      }
      if (animate) {
        animation.animatePiece(move.type, move.endCoords, move.startCoords);
        const resetAnimations = false;
        animation.animatePiece(movedPiece.type, castledPieceCoords, specialTag.coord, void 0, resetAnimations);
      }
      return true;
    },
    // pawnIndex should be specified if it's a promotion move we're undoing
    pawns(gamefile2, move, { updateData = true, animate = true } = {}) {
      const enpassantTag = move.enpassant;
      const promotionTag = move.promotion;
      const isDoublePush = Math.abs(move.endCoords[1] - move.startCoords[1]) === 2;
      if (!enpassantTag && !promotionTag && !isDoublePush) return false;
      const movedPiece = gamefileutility2.getPieceAtCoords(gamefile2, move.endCoords);
      if (move.promotion) {
        const WorB = math.getWorBFromType(movedPiece.type);
        movepiece.deletePiece(gamefile2, movedPiece, { updateData });
        const type = "pawns" + WorB;
        movepiece.addPiece(gamefile2, type, move.startCoords, move.rewindInfo.pawnIndex, { updateData });
      } else {
        movepiece.movePiece(gamefile2, movedPiece, move.startCoords, { updateData });
        if (!updateData && isDoublePush) {
          delete gamefile2.enpassant;
        }
      }
      if (move.enpassant) {
        const type = move.captured;
        const captureCoords = [move.endCoords[0], move.endCoords[1] + move.enpassant];
        movepiece.addPiece(gamefile2, type, captureCoords, move.rewindInfo.capturedIndex, { updateData });
      } else if (move.captured) {
        const type = move.captured;
        movepiece.addPiece(gamefile2, type, move.endCoords, move.rewindInfo.capturedIndex, { updateData });
      }
      if (animate) animation.animatePiece(move.type, move.endCoords, move.startCoords);
      return true;
    }
  };

  // src/client/scripts/game/chess/specialmove.mjs
  var specialmove = {
    // This returns the functions for executing special moves,
    // it does NOT calculate if they're legal.
    // In the future, parameters can be added if variants have
    // different special moves for pieces.
    getFunctions() {
      return {
        "kings": specialmove.kings,
        "royalCentaurs": specialmove.kings,
        "pawns": specialmove.pawns
      };
    },
    // A custom special move needs to be able to:
    // * Delete a custom piece
    // * Move a custom piece
    // * Add a custom piece
    // ALL FUNCTIONS NEED TO:
    // * Make the move
    // * Append the move
    // * Animate the piece
    // Called when the piece moved is a king.
    // Tests if the move contains "castle" special move, if so it executes it!
    // RETURNS FALSE if special move was not executed!
    kings(gamefile2, piece, move, { updateData = true, animate = true, updateProperties = true, simulated = false } = {}) {
      const specialTag = move.castle;
      if (!specialTag) return false;
      movepiece.movePiece(gamefile2, piece, move.endCoords, { updateData });
      const pieceToCastleWith = gamefileutility2.getPieceAtCoords(gamefile2, specialTag.coord);
      const landSquare = [move.endCoords[0] - specialTag.dir, move.endCoords[1]];
      const key = math2.getKeyFromCoords(pieceToCastleWith.coords);
      delete gamefile2.specialRights[key];
      movepiece.movePiece(gamefile2, pieceToCastleWith, landSquare, { updateData });
      if (animate) {
        animation.animatePiece(piece.type, piece.coords, move.endCoords);
        const resetAnimations = false;
        animation.animatePiece(pieceToCastleWith.type, pieceToCastleWith.coords, landSquare, void 0, resetAnimations);
      }
      return true;
    },
    pawns(gamefile2, piece, move, { updateData = true, animate = true, updateProperties = true, simulated = false } = {}) {
      if (updateProperties && specialmove.isPawnMoveADoublePush(piece.coords, move.endCoords)) {
        gamefile2.enpassant = specialmove.getEnPassantSquare(piece.coords, move.endCoords);
      }
      const enpassantTag = move.enpassant;
      const promotionTag = move.promotion;
      if (!enpassantTag && !promotionTag) return false;
      ;
      const captureCoords = enpassantTag ? specialmove.getEnpassantCaptureCoords(move.endCoords, enpassantTag) : move.endCoords;
      const capturedPiece = gamefileutility2.getPieceAtCoords(gamefile2, captureCoords);
      if (capturedPiece) move.captured = capturedPiece.type;
      if (capturedPiece && simulated) move.rewindInfo.capturedIndex = capturedPiece.index;
      if (capturedPiece) movepiece.deletePiece(gamefile2, capturedPiece, { updateData });
      if (promotionTag) {
        movepiece.deletePiece(gamefile2, piece, { updateData });
        movepiece.addPiece(gamefile2, promotionTag, move.endCoords, null, { updateData });
      } else {
        movepiece.movePiece(gamefile2, piece, move.endCoords, { updateData });
      }
      if (animate) animation.animatePiece(piece.type, piece.coords, move.endCoords, capturedPiece);
      return true;
    },
    isPawnMoveADoublePush(pawnCoords, endCoords) {
      return Math.abs(pawnCoords[1] - endCoords[1]) === 2;
    },
    /**
     * Returns the en passant square of a pawn double push move
     * @param {number[]} moveStartCoords - The start coordinates of the move
     * @param {number[]} moveEndCoords - The end coordinates of the move
     * @returns {number[]} The coordinates en passant is allowed
     */
    getEnPassantSquare(moveStartCoords, moveEndCoords) {
      const y = (moveStartCoords[1] + moveEndCoords[1]) / 2;
      return [moveStartCoords[0], y];
    },
    // MUST require there be an enpassant tag!
    getEnpassantCaptureCoords(endCoords, enpassantTag) {
      return [endCoords[0], endCoords[1] + enpassantTag];
    }
  };

  // src/client/scripts/game/chess/variantomega.mjs
  var variantomega = function() {
    function initOmega(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = variant.getStartingPositionOfVariant({ Variant: "Omega" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "black"
      };
      gamefile2.gameRules = variant.getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initOmegaSquared(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = variant.getStartingPositionOfVariant({ Variant: "Omega_Squared" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "black"
      };
      gamefile2.gameRules = variant.getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initOmegaCubed(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = variant.getStartingPositionOfVariant({ Variant: "Omega_Cubed" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "black"
      };
      gamefile2.gameRules = variant.getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initOmegaFourth(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = variant.getStartingPositionOfVariant({ Variant: "Omega_Fourth" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "black"
      };
      gamefile2.gameRules = variant.getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function genPositionOfOmegaCubed() {
      const dist = 500;
      const startingPos = {};
      startingPos[math2.getKeyFromCoords([3, 15])] = "kingsW";
      startingPos[math2.getKeyFromCoords([4, 13])] = "rooksB";
      appendPawnTower(startingPos, 7, -dist, dist);
      appendPawnTower(startingPos, 8, -dist, dist);
      appendPawnTower(startingPos, 9, -dist, dist);
      startingPos[math2.getKeyFromCoords([9, 10])] = "bishopsW";
      setAir(startingPos, [9, 11]);
      appendPawnTower(startingPos, 10, -dist, dist);
      startingPos[math2.getKeyFromCoords([10, 12])] = "kingsB";
      spawnAllRookTowers(startingPos, 11, 8, dist, dist);
      startingPos[math2.getKeyFromCoords([11, 6])] = "bishopsW";
      appendPawnTower(startingPos, 11, -dist, 5);
      appendPawnTower(startingPos, 12, -dist, 7);
      startingPos[math2.getKeyFromCoords([12, 8])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([13, 9])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([13, 8])] = "pawnsW";
      startingPos[math2.getKeyFromCoords([13, 6])] = "bishopsB";
      startingPos[math2.getKeyFromCoords([14, 10])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([14, 9])] = "pawnsW";
      startingPos[math2.getKeyFromCoords([14, 6])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([14, 5])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([14, 4])] = "pawnsW";
      genBishopTunnel(startingPos, 15, 6, dist, dist);
      surroundPositionInVoidBox(startingPos, { left: -500, right: 500, bottom: -500, top: 500 });
      startingPos[`499,492`] = "voidsN";
      startingPos[`7,-500`] = "pawnsW";
      startingPos[`8,-500`] = "pawnsW";
      startingPos[`9,-500`] = "pawnsW";
      startingPos[`10,-500`] = "pawnsW";
      startingPos[`11,-500`] = "pawnsW";
      startingPos[`12,-500`] = "pawnsW";
      startingPos[`6,-501`] = "voidsN";
      startingPos[`7,-501`] = "voidsN";
      startingPos[`8,-501`] = "voidsN";
      startingPos[`9,-501`] = "voidsN";
      startingPos[`10,-501`] = "voidsN";
      startingPos[`11,-501`] = "voidsN";
      startingPos[`12,-501`] = "voidsN";
      startingPos[`13,-501`] = "voidsN";
      startingPos[`497,-497`] = "voidsN";
      startingPos[`498,-497`] = "voidsN";
      startingPos[`499,-497`] = "voidsN";
      startingPos[`497,-498`] = "voidsN";
      startingPos[`497,-499`] = "voidsN";
      startingPos[`498,-498`] = "voidsN";
      startingPos[`499,-499`] = "voidsN";
      startingPos[`498,-499`] = "bishopsB";
      return startingPos;
      function appendPawnTower(startingPos2, x, startY, endY) {
        if (endY < startY) return;
        for (let y = startY; y <= endY; y++) {
          const thisCoords = [x, y];
          const key = math2.getKeyFromCoords(thisCoords);
          startingPos2[key] = "pawnsW";
        }
      }
      function setAir(startingPos2, coords) {
        const key = math2.getKeyFromCoords(coords);
        delete startingPos2[key];
      }
      function spawnRookTower(startingPos2, xStart, yStart, dist2) {
        startingPos2[math2.getKeyFromCoords([xStart, yStart])] = "bishopsW";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 2])] = "bishopsW";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 4])] = "bishopsW";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 6])] = "bishopsW";
        appendPawnTower(startingPos2, xStart, yStart + 8, dist2);
        startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 1])] = "bishopsW";
        startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 3])] = "bishopsW";
        startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 5])] = "bishopsW";
        if (yStart + 7 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 7])] = "bishopsW";
        if (yStart + 8 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 8])] = "rooksB";
        appendPawnTower(startingPos2, xStart + 2, yStart + 2, dist2);
        if (yStart + 7 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 7])] = "pawnsB";
      }
      function spawnAllRookTowers(startingPos2, xStart, yStart, xEnd, yEnd) {
        let y = yStart;
        for (let x = xStart; x < xEnd; x += 3) {
          spawnRookTower(startingPos2, x, y, yEnd);
          y += 3;
        }
      }
      function genBishopTunnel(startingPos2, xStart, yStart, xEnd, yEnd) {
        let y = yStart;
        for (let x = xStart; x < xEnd; x++) {
          startingPos2[math2.getKeyFromCoords([x, y])] = "pawnsW";
          startingPos2[math2.getKeyFromCoords([x, y + 1])] = "pawnsB";
          startingPos2[math2.getKeyFromCoords([x, y + 4])] = "pawnsW";
          startingPos2[math2.getKeyFromCoords([x, y + 5])] = "pawnsB";
          y++;
          if (y > yEnd) return;
        }
      }
    }
    function genPositionOfOmegaFourth() {
      const dist = 500;
      const startingPos = {
        "-14,17": "pawnsW",
        "-14,18": "pawnsB",
        "-13,14": "pawnsW",
        "-13,15": "pawnsB",
        "-13,16": "pawnsW",
        "-13,17": "pawnsB",
        "-13,20": "pawnsW",
        "-13,21": "pawnsB",
        "-13,22": "pawnsW",
        "-13,23": "pawnsB",
        "-13,24": "pawnsW",
        "-13,25": "pawnsB",
        "-13,26": "pawnsW",
        "-13,27": "pawnsB",
        "-12,16": "bishopsB",
        "-12,25": "bishopsW",
        "-11,14": "pawnsW",
        "-11,15": "pawnsB",
        "-11,16": "kingsB",
        "-11,17": "pawnsB",
        "-11,24": "pawnsW",
        "-11,25": "kingsW",
        "-11,26": "pawnsW",
        "-11,27": "pawnsB",
        "-10,16": "bishopsB",
        "-10,25": "bishopsW",
        "-9,14": "pawnsW",
        "-9,15": "pawnsB",
        "-9,16": "pawnsW",
        "-9,17": "pawnsB",
        "-9,18": "pawnsW",
        "-9,19": "pawnsB",
        "-9,20": "pawnsW",
        "-9,21": "pawnsB",
        "-9,22": "pawnsW",
        "-9,23": "pawnsB",
        "-9,24": "pawnsW",
        "-9,25": "pawnsB",
        "-9,26": "pawnsW",
        "-9,27": "pawnsB"
      };
      const startOfRookTowers = {
        "0,3": "pawnsW",
        "0,4": "pawnsB",
        "0,5": "pawnsW",
        "0,6": "pawnsB",
        "0,11": "pawnsW",
        "0,12": "pawnsB",
        "1,4": "bishopsW",
        "1,12": "bishopsW",
        "1,13": "rooksB",
        "2,1": "pawnsW",
        "2,2": "pawnsB",
        "2,3": "pawnsW",
        "2,4": "pawnsB",
        "2,5": "pawnsW",
        "2,6": "pawnsB",
        "2,7": "pawnsW",
        "2,8": "pawnsW",
        "2,9": "pawnsW",
        "2,10": "pawnsW",
        "2,11": "pawnsW",
        "2,12": "pawnsB",
        "3,2": "bishopsW",
        "3,4": "bishopsB",
        "3,6": "pawnsW",
        "3,7": "pawnsB",
        "3,8": "bishopsW",
        "3,9": "pawnsW",
        "3,10": "bishopsW",
        "3,12": "bishopsW",
        "3,14": "bishopsW",
        "4,1": "pawnsW",
        "4,2": "pawnsB",
        "4,3": "pawnsW",
        "4,4": "pawnsB",
        "4,7": "pawnsW",
        "4,8": "pawnsB",
        "4,9": "bishopsW",
        "4,11": "bishopsW",
        "4,13": "bishopsW",
        "4,15": "bishopsW",
        "4,16": "rooksB",
        "5,4": "pawnsW",
        "5,5": "pawnsB",
        "5,8": "pawnsW",
        "5,9": "pawnsB",
        "5,10": "pawnsW",
        "5,11": "pawnsW",
        "5,12": "pawnsW",
        "5,13": "pawnsW",
        "5,14": "pawnsW",
        "5,15": "pawnsB"
      };
      const keys = Object.keys(startOfRookTowers);
      for (const key of keys) {
        startingPos[key] = startOfRookTowers[key];
      }
      appendPawnTower(startingPos, 0, 13, dist);
      appendPawnTower(startingPos, 2, 13, dist);
      appendPawnTower(startingPos, 3, 16, dist);
      appendPawnTower(startingPos, 5, 16, dist);
      spawnAllRookTowers(startingPos, 6, 3, dist + 3, dist);
      startingPos[math2.getKeyFromCoords([0, -6])] = "pawnsB";
      startingPos[math2.getKeyFromCoords([0, -7])] = "pawnsW";
      spawnAllBishopCannons(startingPos, 1, -7, dist, -dist);
      spawnAllWings(startingPos, -1, -7, -dist, -dist);
      addVoidSquaresToOmegaFourth(startingPos, -866, 500, 567, -426, -134);
      return startingPos;
      function appendPawnTower(startingPos2, x, startY, endY) {
        if (endY < startY) return;
        for (let y = startY; y <= endY; y++) {
          const thisCoords = [x, y];
          const key = math2.getKeyFromCoords(thisCoords);
          startingPos2[key] = "pawnsW";
        }
      }
      function setAir(startingPos2, coords) {
        const key = math2.getKeyFromCoords(coords);
        delete startingPos2[key];
      }
      function spawnRookTower(startingPos2, xStart, yStart, dist2) {
        startingPos2[math2.getKeyFromCoords([xStart, yStart])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([xStart, yStart + 2])] = "pawnsW";
        if (yStart + 3 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 3])] = "pawnsB";
        if (yStart + 6 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 6])] = "pawnsW";
        if (yStart + 7 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 7])] = "pawnsB";
        if (yStart + 8 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 8])] = "bishopsW";
        if (yStart + 9 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 9])] = "pawnsW";
        if (yStart + 10 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 10])] = "bishopsW";
        if (yStart + 12 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 12])] = "bishopsW";
        if (yStart + 14 <= dist2) startingPos2[math2.getKeyFromCoords([xStart, yStart + 14])] = "bishopsW";
        appendPawnTower(startingPos2, xStart, yStart + 16, dist2);
        startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 2])] = "pawnsB";
        if (yStart + 3 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 3])] = "pawnsW";
        if (yStart + 4 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 4])] = "pawnsB";
        if (yStart + 7 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 7])] = "pawnsW";
        if (yStart + 8 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 8])] = "pawnsB";
        if (yStart + 9 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 9])] = "bishopsW";
        if (yStart + 11 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 11])] = "bishopsW";
        if (yStart + 13 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 13])] = "bishopsW";
        if (yStart + 15 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 15])] = "bishopsW";
        if (yStart + 16 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 1, yStart + 16])] = "rooksB";
        startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 2])] = "pawnsW";
        if (yStart + 3 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 3])] = "pawnsB";
        if (yStart + 4 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 4])] = "pawnsW";
        if (yStart + 5 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 5])] = "pawnsB";
        if (yStart + 8 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 8])] = "pawnsW";
        if (yStart + 9 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 9])] = "pawnsB";
        if (yStart + 10 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 10])] = "pawnsW";
        if (yStart + 11 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 11])] = "pawnsW";
        if (yStart + 12 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 12])] = "pawnsW";
        if (yStart + 13 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 13])] = "pawnsW";
        if (yStart + 14 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 14])] = "pawnsW";
        if (yStart + 15 <= dist2) startingPos2[math2.getKeyFromCoords([xStart + 2, yStart + 15])] = "pawnsB";
        appendPawnTower(startingPos2, xStart + 2, yStart + 16, dist2);
      }
      function spawnAllRookTowers(startingPos2, xStart, yStart, xEnd, yEnd) {
        let y = yStart;
        for (let x = xStart; x < xEnd; x += 3) {
          spawnRookTower(startingPos2, x, y, yEnd);
          y += 3;
        }
      }
      function spawnAllBishopCannons(startingPos2, startX, startY, endX, endY) {
        const spacing = 7;
        let currX = startX;
        let currY = startY;
        let i = 0;
        do {
          genBishopCannon(startingPos2, currX, currY, i);
          currX += spacing;
          currY -= spacing;
          i++;
        } while (currX < endX && currY > endY);
      }
      function genBishopCannon(startingPos2, x, y, i) {
        startingPos2[math2.getKeyFromCoords([x, y])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x, y - 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x + 1, y - 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x + 1, y - 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 2])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 3])] = "pawnsW";
        if (y - 3 - x + 3 > -980) startingPos2[math2.getKeyFromCoords([x + 3, y - 3])] = "pawnsB";
        if (y - 4 - x + 3 > -980) startingPos2[math2.getKeyFromCoords([x + 3, y - 4])] = "pawnsW";
        if (y - 5 - x + 4 > -980) startingPos2[math2.getKeyFromCoords([x + 4, y - 4])] = "pawnsB";
        if (y - 3 - x + 4 > -980) startingPos2[math2.getKeyFromCoords([x + 4, y - 5])] = "pawnsW";
        if (y - 4 - x + 5 > -980) startingPos2[math2.getKeyFromCoords([x + 5, y - 3])] = "pawnsB";
        if (y - 4 - x + 5 > -980) startingPos2[math2.getKeyFromCoords([x + 5, y - 4])] = "pawnsW";
        if (y - 2 - x + 6 > -980) startingPos2[math2.getKeyFromCoords([x + 6, y - 2])] = "pawnsB";
        if (y - 3 - x + 6 > -980) startingPos2[math2.getKeyFromCoords([x + 6, y - 3])] = "pawnsW";
        if (y - 1 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y - 1])] = "pawnsB";
        if (y - 2 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y - 2])] = "pawnsW";
        if (y + 1 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y + 1])] = "pawnsB";
        if (y + 0 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y + 0])] = "pawnsW";
        if (y - 2 - x + 8 > -980) startingPos2[math2.getKeyFromCoords([x + 8, y - 2])] = "bishopsB";
        if (y - 6 - x + 6 > -980) startingPos2[math2.getKeyFromCoords([x + 6, y - 6])] = "pawnsB";
        if (y - 7 - x + 6 > -980) startingPos2[math2.getKeyFromCoords([x + 6, y - 7])] = "pawnsW";
        if (y - 5 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y - 5])] = "pawnsB";
        if (y - 6 - x + 7 > -980) startingPos2[math2.getKeyFromCoords([x + 7, y - 6])] = "pawnsW";
        if (y - 4 - x + 8 > -980) startingPos2[math2.getKeyFromCoords([x + 8, y - 4])] = "pawnsB";
        if (y - 5 - x + 8 > -980) startingPos2[math2.getKeyFromCoords([x + 8, y - 5])] = "pawnsW";
        if (y - 3 - x + 9 > -980) startingPos2[math2.getKeyFromCoords([x + 9, y - 3])] = "pawnsB";
        if (y - 4 - x + 9 > -980) startingPos2[math2.getKeyFromCoords([x + 9, y - 4])] = "pawnsW";
        const count = i + 2;
        let puzzleX = x + 8;
        let puzzleY = y + 2;
        const upDiag = puzzleY - puzzleX;
        if (upDiag > -990) {
          for (let a = 1; a <= count; a++) {
            const isLastIndex = a === count;
            genBishopPuzzlePiece(startingPos2, puzzleX, puzzleY, isLastIndex);
            puzzleX += 1;
            puzzleY += 1;
          }
        }
        let pawnX = x + 4;
        let pawnY = y;
        for (let a = 0; a < i; a++) {
          startingPos2[math2.getKeyFromCoords([pawnX, pawnY])] = "pawnsW";
          pawnX++;
          pawnY++;
        }
      }
      function genBishopPuzzlePiece(startingPos2, x, y, isLastIndex) {
        startingPos2[math2.getKeyFromCoords([x, y])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x, y - 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x, y - 2])] = "bishopsB";
        startingPos2[math2.getKeyFromCoords([x + 1, y - 2])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x + 1, y - 3])] = "bishopsB";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 4])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 5])] = "pawnsW";
        if (!isLastIndex) return;
        startingPos2[math2.getKeyFromCoords([x + 1, y - 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x + 1, y - 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 3])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x + 2, y - 2])] = "pawnsB";
      }
      function spawnAllWings(startingPos2, startX, startY, endX, endY) {
        const spacing = 8;
        let currX = startX;
        let currY = startY;
        let i = 0;
        do {
          spawnWing(startingPos2, currX, currY, i);
          currX -= spacing;
          currY -= spacing;
          i++;
        } while (currX > endX && currY > endY);
      }
      function spawnWing(startingPos2, x, y, i) {
        startingPos2[math2.getKeyFromCoords([x, y])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x, y - 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 1, y - 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 1, y - 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y - 2])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 2, y - 3])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 3, y - 3])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 3, y - 4])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 4, y - 4])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 4, y - 5])] = "pawnsW";
        const count = i + 1;
        const segSpacing = 6;
        let segX = x - 5;
        let segY = y - 8;
        for (let a = 1; a <= count; a++) {
          const isLastIndex = a === count;
          genWingSegment(startingPos2, segX, segY, isLastIndex);
          segX -= segSpacing;
          segY += segSpacing;
        }
        setAir(startingPos2, [x - 6, y - 8]);
        setAir(startingPos2, [x - 6, y - 9]);
        setAir(startingPos2, [x - 5, y - 9]);
        setAir(startingPos2, [x - 5, y - 10]);
      }
      function genWingSegment(startingPos2, x, y, isLastIndex) {
        startingPos2[math2.getKeyFromCoords([x, y - 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x, y - 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 1, y - 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 1, y + 0])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 0])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 1])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 3, y + 1])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 3, y + 2])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 3])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 3])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 4])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x, y + 2])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x, y + 3])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 1, y + 3])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 1, y + 4])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 4])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 5])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 6])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 7])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 8])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 9])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 10])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 2, y + 11])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 3, y + 11])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 3, y + 12])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 12])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 13])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 11])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 12])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 10])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 9])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 8])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 7])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 7])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 6])] = "pawnsW";
        startingPos2[math2.getKeyFromCoords([x - 4, y + 10])] = "bishopsW";
        if (!isLastIndex) return;
        startingPos2[math2.getKeyFromCoords([x - 5, y + 6])] = "pawnsB";
        startingPos2[math2.getKeyFromCoords([x - 5, y + 5])] = "pawnsW";
      }
    }
    function surroundPositionInVoidBox(position, box) {
      for (let x = box.left; x <= box.right; x++) {
        let key = math2.getKeyFromCoords([x, box.bottom]);
        position[key] = "voidsN";
        key = math2.getKeyFromCoords([x, box.top]);
        position[key] = "voidsN";
      }
      for (let y = box.bottom; y <= box.top; y++) {
        let key = math2.getKeyFromCoords([box.left, y]);
        position[key] = "voidsN";
        key = math2.getKeyFromCoords([box.right, y]);
        position[key] = "voidsN";
      }
    }
    function addVoidSquaresToOmegaFourth(startingPos, left, top, right, bottomright, bottomleft) {
      for (let x = left; x <= right; x++) {
        const key = math2.getKeyFromCoords([x, top]);
        startingPos[key] = "voidsN";
      }
      for (let y2 = top; y2 >= bottomright; y2--) {
        const key = math2.getKeyFromCoords([right, y2]);
        startingPos[key] = "voidsN";
      }
      let y = bottomright;
      for (let x = right; x >= -3; x--) {
        let key = math2.getKeyFromCoords([x, y]);
        startingPos[key] = "voidsN";
        key = math2.getKeyFromCoords([x, y - 1]);
        startingPos[key] = "voidsN";
        y--;
      }
      for (let y2 = top; y2 >= bottomleft; y2--) {
        const key = math2.getKeyFromCoords([left, y2]);
        startingPos[key] = "voidsN";
      }
      y = bottomleft;
      for (let x = left; x <= -4; x++) {
        let key = math2.getKeyFromCoords([x, y]);
        startingPos[key] = "voidsN";
        key = math2.getKeyFromCoords([x, y - 1]);
        startingPos[key] = "voidsN";
        y--;
      }
      startingPos[`492,493`] = "voidsN";
    }
    return Object.freeze({
      initOmega,
      initOmegaSquared,
      initOmegaCubed,
      initOmegaFourth,
      genPositionOfOmegaCubed,
      genPositionOfOmegaFourth
    });
  }();

  // src/client/scripts/game/chess/movesets.mjs
  var movesets = function() {
    function getPieceMovesets(slideLimit = Infinity) {
      if (typeof slideLimit !== "number") throw new Error("slideLimit gamerule is in an unsupported value.");
      return {
        // Finitely moving
        pawns: function() {
          return { individual: [] };
        },
        knights: function() {
          return {
            individual: [
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ]
          };
        },
        hawks: function() {
          return {
            individual: [
              [-3, 0],
              [-2, 0],
              [2, 0],
              [3, 0],
              [0, -3],
              [0, -2],
              [0, 2],
              [0, 3],
              [-2, -2],
              [-2, 2],
              [2, -2],
              [2, 2],
              [-3, -3],
              [-3, 3],
              [3, -3],
              [3, 3]
            ]
          };
        },
        kings: function() {
          return {
            individual: [
              [-1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
              [1, 0],
              [1, -1],
              [0, -1],
              [-1, -1]
            ]
          };
        },
        guards: function() {
          return {
            individual: [
              [-1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
              [1, 0],
              [1, -1],
              [0, -1],
              [-1, -1]
            ]
          };
        },
        // Infinitely moving
        rooks: function() {
          return {
            individual: [],
            sliding: {
              "1,0": [-slideLimit, slideLimit],
              "0,1": [-slideLimit, slideLimit]
            }
          };
        },
        bishops: function() {
          return {
            individual: [],
            sliding: {
              "1,1": [-slideLimit, slideLimit],
              // These represent the x limit of the piece sliding diagonally
              "1,-1": [-slideLimit, slideLimit]
            }
          };
        },
        queens: function() {
          return {
            individual: [],
            sliding: {
              "1,0": [-slideLimit, slideLimit],
              "0,1": [-slideLimit, slideLimit],
              "1,1": [-slideLimit, slideLimit],
              // These represent the x limit of the piece sliding diagonally
              "1,-1": [-slideLimit, slideLimit]
            }
          };
        },
        royalQueens: function() {
          return {
            individual: [],
            sliding: {
              "1,0": [-slideLimit, slideLimit],
              "0,1": [-slideLimit, slideLimit],
              "1,1": [-slideLimit, slideLimit],
              // These represent the x limit of the piece sliding diagonally
              "1,-1": [-slideLimit, slideLimit]
            }
          };
        },
        chancellors: function() {
          return {
            individual: [
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ],
            sliding: {
              "1,0": [-slideLimit, slideLimit],
              "0,1": [-slideLimit, slideLimit]
            }
          };
        },
        archbishops: function() {
          return {
            individual: [
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ],
            sliding: {
              "1,1": [-slideLimit, slideLimit],
              "1,-1": [-slideLimit, slideLimit]
            }
          };
        },
        amazons: function() {
          return {
            individual: [
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ],
            sliding: {
              "1,0": [-slideLimit, slideLimit],
              "0,1": [-slideLimit, slideLimit],
              "1,1": [-slideLimit, slideLimit],
              // These represent the x limit of the piece sliding diagonally
              "1,-1": [-slideLimit, slideLimit]
            }
          };
        },
        camels: function() {
          return {
            individual: [
              [-3, 1],
              [-1, 3],
              [1, 3],
              [3, 1],
              [-3, -1],
              [-1, -3],
              [1, -3],
              [3, -1]
            ]
          };
        },
        giraffes: function() {
          return {
            individual: [
              [-4, 1],
              [-1, 4],
              [1, 4],
              [4, 1],
              [-4, -1],
              [-1, -4],
              [1, -4],
              [4, -1]
            ]
          };
        },
        zebras: function() {
          return {
            individual: [
              [-3, 2],
              [-2, 3],
              [2, 3],
              [3, 2],
              [-3, -2],
              [-2, -3],
              [2, -3],
              [3, -2]
            ]
          };
        },
        knightriders: function() {
          return {
            individual: [],
            sliding: {
              "1,2": [-slideLimit, slideLimit],
              "1,-2": [-slideLimit, slideLimit],
              "2,1": [-slideLimit, slideLimit],
              "2,-1": [-slideLimit, slideLimit]
            }
          };
        },
        centaurs: function() {
          return {
            individual: [
              // Guard moveset
              [-1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
              [1, 0],
              [1, -1],
              [0, -1],
              [-1, -1],
              // + Knight moveset!
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ]
          };
        },
        royalCentaurs: function() {
          return {
            individual: [
              // Guard moveset
              [-1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
              [1, 0],
              [1, -1],
              [0, -1],
              [-1, -1],
              // + Knight moveset!
              [-2, 1],
              [-1, 2],
              [1, 2],
              [2, 1],
              [-2, -1],
              [-1, -2],
              [1, -2],
              [2, -1]
            ]
          };
        }
      };
    }
    return Object.freeze({
      getPieceMovesets
    });
  }();

  // src/client/scripts/game/chess/variant.mjs
  var variant = function() {
    const validVariants = ["Classical", "Core", "Standarch", "Space_Classic", "CoaIP", "Pawn_Horde", "Space", "Obstocean", "Abundance", "Amazon_Chandelier", "Containment", "Classical_Limit_7", "CoaIP_Limit_7", "Chess", "Classical_KOTH", "CoaIP_KOTH", "Omega", "Omega_Squared", "Omega_Cubed", "Omega_Fourth", "Classical_Plus", "Pawndard", "Knightline", "Knighted_Chess"];
    function isVariantValid(variantName) {
      return validVariants.includes(variantName);
    }
    function setupVariant(gamefile2, metadata, options3) {
      if (options3) initStartSnapshotAndGamerulesFromOptions(gamefile2, metadata, options3);
      else initStartSnapshotAndGamerules(gamefile2, metadata);
      gamefile2.startSnapshot.playerCount = new Set(gamefile2.gameRules.turnOrder).size;
      initExistingTypes(gamefile2);
      initPieceMovesets(gamefile2);
      initSlidingMoves(gamefile2);
    }
    function initExistingTypes(gamefile2) {
      const teamtypes = new Set(Object.values(gamefile2.startSnapshot.position));
      const promotiontypes = [...gamefile2.gameRules.promotionsAllowed.white, ...gamefile2.gameRules.promotionsAllowed.black];
      const rawtypes = new Set(promotiontypes);
      for (const tpiece of teamtypes) {
        rawtypes.add(math2.trimWorBFromType(tpiece));
      }
      gamefile2.startSnapshot.existingTypes = rawtypes;
    }
    function initSlidingMoves(gamefile2) {
      gamefile2.startSnapshot.slidingPossible = getPossibleSlides(gamefile2);
    }
    function getPossibleSlides(gamefile2) {
      const rawtypes = gamefile2.startSnapshot.existingTypes;
      const movesets2 = gamefile2.pieceMovesets;
      const slides = /* @__PURE__ */ new Set(["1,0"]);
      for (const type of rawtypes) {
        let moveset = movesets2[type];
        if (!moveset) continue;
        moveset = moveset();
        if (!moveset.sliding) continue;
        Object.keys(moveset.sliding).forEach((slide) => {
          slides.add(slide);
        });
      }
      const temp = [];
      slides.forEach((slideline) => {
        temp.push(math2.getCoordsFromKey(slideline));
      });
      return temp;
    }
    function initPieceMovesets(gamefile2) {
      gamefile2.pieceMovesets = movesets.getPieceMovesets(gamefile2.gameRules.slideLimit);
      gamefile2.specialDetects = specialdetect.getSpecialMoves();
      gamefile2.specialMoves = specialmove.getFunctions();
      gamefile2.specialUndos = specialundo.getFunctions();
      gamefile2.vicinity = legalmoves.genVicinity(gamefile2);
    }
    function initStartSnapshotAndGamerulesFromOptions(gamefile2, { Variant, UTCDate, UTCTime }, options3) {
      let positionString = options3.positionString;
      let position = options3.startingPosition;
      let specialRights = options3.specialRights;
      if (!options3.startingPosition) {
        const result = getStartingPositionOfVariant({ Variant, UTCDate, UTCTime });
        positionString = result.positionString;
        position = result.position;
        specialRights = result.specialRights;
      } else positionString = formatconverter2.LongToShort_Position(options3.startingPosition, options3.specialRights);
      options3.gameRules.turnOrder = options3.gameRules.turnOrder || getDefaultTurnOrder();
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        fullMove: options3.fullMove || 1
      };
      if (options3.enpassant) gamefile2.startSnapshot.enpassant = options3.enpassant;
      if (options3.moveRule) {
        const [state, max] = options3.moveRule.split("/");
        gamefile2.startSnapshot.moveRuleState = Number(state);
        options3.gameRules.moveRule = Number(max);
      }
      gamefile2.gameRules = options3.gameRules;
    }
    function initStartSnapshotAndGamerules(gamefile2, { Variant, UTCDate, UTCTime }) {
      switch (Variant) {
        case "Classical":
          initClassical(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Core":
          initCore(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Standarch":
          initStandarch(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Space_Classic":
          initSpaceClassic(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "CoaIP":
          initCoaip(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Pawn_Horde":
          initPawnHorde(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Space":
          initSpace(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Obstocean":
          initObstocean(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Abundance":
          initAbundance(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Amazon_Chandelier":
          initAmazonChandelier(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Containment":
          initContainment(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Classical_Limit_7":
          initClassical(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "CoaIP_Limit_7":
          initCoaip(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Chess":
          initChess(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Classical_KOTH":
          initClassical(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "CoaIP_KOTH":
          initCoaip(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Classical_Plus":
          initClassicalPlus(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Pawndard":
          initPawndard(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Knightline":
          initKnightline(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Knighted_Chess":
          initKnightedChess(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        // Showcasings...
        case "Omega":
          variantomega.initOmega(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Omega_Squared":
          variantomega.initOmegaSquared(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Omega_Cubed":
          variantomega.initOmegaCubed(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        case "Omega_Fourth":
          variantomega.initOmegaFourth(gamefile2, { Variant, UTCDate, UTCTime });
          break;
        // Removed...
        /*
        case "Standarch - 3 Check":
            initStandarch(gamefile, { Variant, UTCDate, UTCTime });
            break;
        case "CoaIP - 3 Check":
            initCoaip(gamefile, { Variant, UTCDate, UTCTime });
            break;
            */
        default:
          throw new Error(`Unknown variant "${Variant}"`);
      }
      if (gamefile2.gameRules.moveRule) gamefile2.startSnapshot.moveRuleState = 0;
      gamefile2.startSnapshot.fullMove = 1;
    }
    function getGameRules(modifications = {}) {
      const promotionRanks = modifications.promotionRanks || (modifications.promotionRanks === null ? null : [8, 1]);
      const gameRules = {
        promotionRanks,
        promotionsAllowed: modifications.promotionsAllowed || getPromotionsAllowed(modifications.position, promotionRanks),
        winConditions: modifications.winConditions || getDefaultWinConditions(),
        moveRule: modifications.moveRule || 100,
        turnOrder: modifications.turnOrder || getDefaultTurnOrder()
      };
      if (modifications.slideLimit != null) gameRules.slideLimit = modifications.slideLimit;
      if (modifications.moveRule === null) delete gameRules.moveRule;
      return gameRules;
    }
    function getDefaultTurnOrder() {
      return ["white", "black"];
    }
    function getTurnOrderOfOmega() {
      return ["black", "white"];
    }
    function getDefaultWinConditions() {
      return { white: ["checkmate"], black: ["checkmate"] };
    }
    function getRoyalCaptureWinConditions() {
      return { white: ["royalcapture"], black: ["royalcapture"] };
    }
    function getWinConditionsOfThreeCheck() {
      return { white: ["checkmate", "threecheck"], black: ["checkmate", "threecheck"] };
    }
    function getWinConditionsOfKOTH() {
      return { white: ["checkmate", "koth"], black: ["checkmate", "koth"] };
    }
    function getDefaultPromotionsAllowed() {
      return { white: ["knights", "bishops", "rooks", "queens"], black: ["knights", "bishops", "rooks", "queens"] };
    }
    function getBareMinimumGameRules() {
      return { winConditions: getDefaultWinConditions() };
    }
    function getStartingPositionOfVariant({ Variant, UTCDate, UTCTime }) {
      let positionString;
      let startingPosition;
      switch (Variant) {
        case "Classical":
          positionString = "P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "Core":
          positionString = "p-1,10+|p3,10+|p4,10+|p5,10+|p6,10+|p10,10+|p0,9+|p9,9+|n0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|n9,8|p-2,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p11,7+|p-3,6+|p12,6+|p1,5+|P2,5+|P7,5+|p8,5+|P1,4+|p2,4+|p7,4+|P8,4+|P-3,3+|P12,3+|P-2,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P11,2+|N0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|N9,1|P0,0+|P9,0+|P-1,-1+|P3,-1+|P4,-1+|P5,-1+|P6,-1+|P10,-1+";
          return getStartSnapshotPosition({ positionString });
        case "Standarch":
          positionString = "p4,11+|p5,11+|p1,10+|p2,10+|p3,10+|p6,10+|p7,10+|p8,10+|p0,9+|ar4,9|ch5,9|p9,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P0,0+|AR4,0|CH5,0|P9,0+|P1,-1+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P8,-1+|P4,-2+|P5,-2+";
          return getStartSnapshotPosition({ positionString });
        case "Space_Classic":
          positionString = getPositionStringOfSpaceClassic(UTCDate, UTCTime);
          return getStartSnapshotPosition({ positionString });
        case "CoaIP":
          positionString = "P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|HA-2,-6|HA11,-6|ha-2,15|ha11,15|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "Pawn_Horde":
          positionString = "k5,2+|q4,2|r1,2+|n7,2|n2,2|r8,2+|b3,2|b6,2|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P1,-2+|P2,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P8,-2+|P1,-3+|P2,-3+|P4,-3+|P5,-3+|P6,-3+|P7,-3+|P8,-3+|P1,-4+|P2,-4+|P4,-4+|P5,-4+|P6,-4+|P7,-4+|P8,-4+|P1,-5+|P2,-5+|P4,-5+|P5,-5+|P6,-5+|P7,-5+|P8,-5+|P1,-6+|P2,-6+|P4,-6+|P5,-6+|P6,-6+|P7,-6+|P8,-6+|P3,-2+|P3,-3+|P3,-4+|P3,-5+|P3,-6+|P1,-7+|P2,-7+|P3,-7+|P4,-7+|P5,-7+|P6,-7+|P7,-7+|P8,-7+|P0,-6+|P0,-7+|P9,-6+|P9,-7+|p9,2+|p1,1+|p2,1+|p3,1+|p4,1+|p5,1+|p6,1+|p7,1+|p8,1+|p0,2+";
          return getStartSnapshotPosition({ positionString });
        case "Space":
          positionString = "q4,31|ch4,23|p-12,18+|b4,18|p20,18+|p-11,17+|ar-10,17|p0,17+|b4,17|p8,17+|ar18,17|p19,17+|p-11,16+|p-10,16+|p-1,16+|p9,16+|p18,16+|p19,16+|p-1,15+|r0,15|ha4,15|r8,15|p9,15+|p3,6+|p4,6+|p5,6+|p2,5+|k4,5|p6,5+|n1,4|ce4,4|n7,4|p-10,3+|p-1,3+|p0,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p8,3+|p9,3+|p-12,2+|p-11,2+|p19,2+|p20,2+|p-13,1+|p21,1+|P-13,0+|P21,0+|P-12,-1+|P-11,-1+|P19,-1+|P20,-1+|P-1,-2+|P0,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P8,-2+|P9,-2+|P18,-2+|N1,-3|CE4,-3|N7,-3|P2,-4+|K4,-4|P6,-4+|P3,-5+|P4,-5+|P5,-5+|P-1,-14+|R0,-14|HA4,-14|R8,-14|P9,-14+|P-11,-15+|P-10,-15+|P-1,-15+|P9,-15+|P18,-15+|P19,-15+|P-11,-16+|AR-10,-16|P0,-16+|B4,-16|P8,-16+|AR18,-16|P19,-16+|P-12,-17+|B4,-17|P20,-17+|CH4,-22|Q4,-30";
          return getStartSnapshotPosition({ positionString });
        case "Obstocean":
          positionString = "vo-8,14|vo-7,14|vo-6,14|vo-5,14|vo-4,14|vo-3,14|vo-2,14|vo-1,14|vo0,14|vo1,14|vo2,14|vo3,14|vo4,14|vo5,14|vo6,14|vo7,14|vo8,14|vo9,14|vo10,14|vo11,14|vo12,14|vo13,14|vo14,14|vo15,14|vo16,14|vo17,14|vo-8,13|vo-7,13|vo-6,13|vo-5,13|vo-4,13|vo-3,13|vo-2,13|vo-1,13|vo0,13|vo1,13|vo2,13|vo3,13|vo4,13|vo5,13|vo6,13|vo7,13|vo8,13|vo9,13|vo10,13|vo11,13|vo12,13|vo13,13|vo14,13|vo15,13|vo16,13|vo17,13|vo-8,12|vo-7,12|ob-6,12|ob-5,12|ob-4,12|ob-3,12|ob-2,12|ob-1,12|ob0,12|ob1,12|ob2,12|ob3,12|ob4,12|ob5,12|ob6,12|ob7,12|ob8,12|ob9,12|ob10,12|ob11,12|ob12,12|ob13,12|ob14,12|ob15,12|vo16,12|vo17,12|vo-8,11|vo-7,11|ob-6,11|ob-5,11|ob-4,11|ob-3,11|ob-2,11|ob-1,11|ob0,11|ob1,11|ob2,11|ob3,11|ob4,11|ob5,11|ob6,11|ob7,11|ob8,11|ob9,11|ob10,11|ob11,11|ob12,11|ob13,11|ob14,11|ob15,11|vo16,11|vo17,11|vo-8,10|vo-7,10|ob-6,10|ob-5,10|ob-4,10|ob-3,10|ob-2,10|ob-1,10|ob0,10|ob1,10|ob2,10|ob3,10|ob4,10|ob5,10|ob6,10|ob7,10|ob8,10|ob9,10|ob10,10|ob11,10|ob12,10|ob13,10|ob14,10|ob15,10|vo16,10|vo17,10|vo-8,9|vo-7,9|ob-6,9|ob-5,9|ob-4,9|ob-3,9|ob-2,9|ob-1,9|ob0,9|ob1,9|ob2,9|ob3,9|ob4,9|ob5,9|ob6,9|ob7,9|ob8,9|ob9,9|ob10,9|ob11,9|ob12,9|ob13,9|ob14,9|ob15,9|vo16,9|vo17,9|vo-8,8|vo-7,8|ob-6,8|ob-5,8|ob-4,8|ob-3,8|ob-2,8|ob-1,8|ob0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|ob9,8|ob10,8|ob11,8|ob12,8|ob13,8|ob14,8|ob15,8|vo16,8|vo17,8|vo-8,7|vo-7,7|ob-6,7|ob-5,7|ob-4,7|ob-3,7|ob-2,7|ob-1,7|ob0,7|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|ob9,7|ob10,7|ob11,7|ob12,7|ob13,7|ob14,7|ob15,7|vo16,7|vo17,7|vo-8,6|vo-7,6|ob-6,6|ob-5,6|ob-4,6|ob-3,6|ob-2,6|ob-1,6|ob0,6|ob1,6|ob2,6|ob3,6|ob4,6|ob5,6|ob6,6|ob7,6|ob8,6|ob9,6|ob10,6|ob11,6|ob12,6|ob13,6|ob14,6|ob15,6|vo16,6|vo17,6|vo-8,5|vo-7,5|ob-6,5|ob-5,5|ob-4,5|ob-3,5|ob-2,5|ob-1,5|ob0,5|ob1,5|ob2,5|ob3,5|ob4,5|ob5,5|ob6,5|ob7,5|ob8,5|ob9,5|ob10,5|ob11,5|ob12,5|ob13,5|ob14,5|ob15,5|vo16,5|vo17,5|vo-8,4|vo-7,4|ob-6,4|ob-5,4|ob-4,4|ob-3,4|ob-2,4|ob-1,4|ob0,4|ob1,4|ob2,4|ob3,4|ob4,4|ob5,4|ob6,4|ob7,4|ob8,4|ob9,4|ob10,4|ob11,4|ob12,4|ob13,4|ob14,4|ob15,4|vo16,4|vo17,4|vo-8,3|vo-7,3|ob-6,3|ob-5,3|ob-4,3|ob-3,3|ob-2,3|ob-1,3|ob0,3|ob1,3|ob2,3|ob3,3|ob4,3|ob5,3|ob6,3|ob7,3|ob8,3|ob9,3|ob10,3|ob11,3|ob12,3|ob13,3|ob14,3|ob15,3|vo16,3|vo17,3|vo-8,2|vo-7,2|ob-6,2|ob-5,2|ob-4,2|ob-3,2|ob-2,2|ob-1,2|ob0,2|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|ob9,2|ob10,2|ob11,2|ob12,2|ob13,2|ob14,2|ob15,2|vo16,2|vo17,2|vo-8,1|vo-7,1|ob-6,1|ob-5,1|ob-4,1|ob-3,1|ob-2,1|ob-1,1|ob0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|ob9,1|ob10,1|ob11,1|ob12,1|ob13,1|ob14,1|ob15,1|vo16,1|vo17,1|vo-8,0|vo-7,0|ob-6,0|ob-5,0|ob-4,0|ob-3,0|ob-2,0|ob-1,0|ob0,0|ob1,0|ob2,0|ob3,0|ob4,0|ob5,0|ob6,0|ob7,0|ob8,0|ob9,0|ob10,0|ob11,0|ob12,0|ob13,0|ob14,0|ob15,0|vo16,0|vo17,0|vo-8,-1|vo-7,-1|ob-6,-1|ob-5,-1|ob-4,-1|ob-3,-1|ob-2,-1|ob-1,-1|ob0,-1|ob1,-1|ob2,-1|ob3,-1|ob4,-1|ob5,-1|ob6,-1|ob7,-1|ob8,-1|ob9,-1|ob10,-1|ob11,-1|ob12,-1|ob13,-1|ob14,-1|ob15,-1|vo16,-1|vo17,-1|vo-8,-2|vo-7,-2|ob-6,-2|ob-5,-2|ob-4,-2|ob-3,-2|ob-2,-2|ob-1,-2|ob0,-2|ob1,-2|ob2,-2|ob3,-2|ob4,-2|ob5,-2|ob6,-2|ob7,-2|ob8,-2|ob9,-2|ob10,-2|ob11,-2|ob12,-2|ob13,-2|ob14,-2|ob15,-2|vo16,-2|vo17,-2|vo-8,-3|vo-7,-3|ob-6,-3|ob-5,-3|ob-4,-3|ob-3,-3|ob-2,-3|ob-1,-3|ob0,-3|ob1,-3|ob2,-3|ob3,-3|ob4,-3|ob5,-3|ob6,-3|ob7,-3|ob8,-3|ob9,-3|ob10,-3|ob11,-3|ob12,-3|ob13,-3|ob14,-3|ob15,-3|vo16,-3|vo17,-3|vo-8,-4|vo-7,-4|vo-6,-4|vo-5,-4|vo-4,-4|vo-3,-4|vo-2,-4|vo-1,-4|vo0,-4|vo1,-4|vo2,-4|vo3,-4|vo4,-4|vo5,-4|vo6,-4|vo7,-4|vo8,-4|vo9,-4|vo10,-4|vo11,-4|vo12,-4|vo13,-4|vo14,-4|vo15,-4|vo16,-4|vo17,-4|vo-8,-5|vo-7,-5|vo-6,-5|vo-5,-5|vo-4,-5|vo-3,-5|vo-2,-5|vo-1,-5|vo0,-5|vo1,-5|vo2,-5|vo3,-5|vo4,-5|vo5,-5|vo6,-5|vo7,-5|vo8,-5|vo9,-5|vo10,-5|vo11,-5|vo12,-5|vo13,-5|vo14,-5|vo15,-5|vo16,-5|vo17,-5";
          return getStartSnapshotPosition({ positionString });
        case "Abundance":
          positionString = "p-3,10+|ha-2,10|ha-1,10|r0,10|ha1,10|ha2,10|p3,10+|p-2,9+|p-1,9+|p1,9+|p2,9+|p-5,6+|gu-4,6|r-3,6+|b-2,6|b-1,6|k0,6+|b1,6|b2,6|r3,6+|gu4,6|p5,6+|p-4,5+|gu-3,5|n-1,5|q0,5|n1,5|gu3,5|p4,5+|p-3,4+|p-2,4+|gu-1,4|ch0,4|gu1,4|p2,4+|p3,4+|p-1,3+|p0,3+|p1,3+|P-1,-3+|P0,-3+|P1,-3+|P-3,-4+|P-2,-4+|GU-1,-4|CH0,-4|GU1,-4|P2,-4+|P3,-4+|P-4,-5+|GU-3,-5|N-1,-5|Q0,-5|N1,-5|GU3,-5|P4,-5+|P-5,-6+|GU-4,-6|R-3,-6+|B-2,-6|B-1,-6|K0,-6+|B1,-6|B2,-6|R3,-6+|GU4,-6|P5,-6+|P-2,-9+|P-1,-9+|P1,-9+|P2,-9+|P-3,-10+|HA-2,-10|HA-1,-10|R0,-10|HA1,-10|HA2,-10|P3,-10+";
          return getStartSnapshotPosition({ positionString });
        case "Amazon_Chandelier":
          positionString = "p-1,26+|p1,26+|p-2,25+|p-1,25+|p0,25+|p1,25+|p2,25+|p-2,24+|p-1,24+|am0,24|p1,24+|p2,24+|p-2,23+|p-1,23+|p0,23+|p1,23+|p2,23+|p-2,22+|p-1,22+|p1,22+|p2,22+|p-5,21+|p-4,21+|p-3,21+|p-2,21+|p-1,21+|p1,21+|p2,21+|p3,21+|p4,21+|p5,21+|p-5,20+|q-4,20|p-3,20+|p-2,20+|p-1,20+|p1,20+|p2,20+|p3,20+|q4,20|p5,20+|p-5,19+|p-4,19+|p-3,19+|p-2,19+|p-1,19+|p1,19+|p2,19+|p3,19+|p4,19+|p5,19+|p-5,18+|p-3,18+|p-2,18+|p-1,18+|p1,18+|p2,18+|p3,18+|p5,18+|p-8,17+|p-5,17+|p-3,17+|p-2,17+|p-1,17+|p1,17+|p2,17+|p3,17+|p5,17+|p8,17+|p-11,16+|p-10,16+|gu-9,16|ha-8,16|p-7,16+|gu-6,16|p-5,16+|p-3,16+|p-2,16+|p-1,16+|p1,16+|p2,16+|p3,16+|p5,16+|gu6,16|p7,16+|ha8,16|gu9,16|p10,16+|p11,16+|p-11,15+|r-10,15|p-9,15+|p-8,15+|r-7,15|p-6,15+|p-5,15+|p-3,15+|p-2,15+|p-1,15+|p1,15+|p2,15+|p3,15+|p5,15+|p6,15+|r7,15|p8,15+|p9,15+|r10,15|p11,15+|gu-12,14|p-11,14+|p-10,14+|p-9,14+|p-8,14+|p-7,14+|p-6,14+|p-5,14+|p-3,14+|p-2,14+|p-1,14+|p1,14+|p2,14+|p3,14+|p5,14+|p6,14+|p7,14+|p8,14+|p9,14+|p10,14+|p11,14+|gu12,14|p-19,13+|p-17,13+|gu-16,13|p-14,13+|p-12,13+|p-11,13+|p-9,13+|p-8,13+|p-6,13+|p-5,13+|p-3,13+|p-2,13+|p-1,13+|p1,13+|p2,13+|p3,13+|p5,13+|p6,13+|p8,13+|p9,13+|p11,13+|p12,13+|p14,13+|gu16,13|p17,13+|p19,13+|p-19,12+|b-18,12|p-17,12+|gu-16,12|p-14,12+|b-13,12|p-12,12+|p-11,12+|p-9,12+|p-8,12+|p-6,12+|p-5,12+|p-3,12+|p-2,12+|p-1,12+|p1,12+|p2,12+|p3,12+|p5,12+|p6,12+|p8,12+|p9,12+|p11,12+|p12,12+|b13,12|p14,12+|gu16,12|p17,12+|b18,12|p19,12+|gu-20,11|p-19,11+|p-17,11+|p-14,11+|p-12,11+|p-11,11+|p-9,11+|p-8,11+|p-6,11+|p-5,11+|p-3,11+|p-2,11+|p-1,11+|p1,11+|p2,11+|p3,11+|p5,11+|p6,11+|p8,11+|p9,11+|p11,11+|p12,11+|p14,11+|p17,11+|p19,11+|gu20,11|ha-20,10|p-19,10+|p-17,10+|p-14,10+|p-12,10+|p-11,10+|p-9,10+|p-8,10+|p-6,10+|p-5,10+|p-3,10+|p-2,10+|p-1,10+|p1,10+|p2,10+|p3,10+|p5,10+|p6,10+|p8,10+|p9,10+|p11,10+|p12,10+|p14,10+|p17,10+|p19,10+|ha20,10|n-11,9|n11,9|n-10,7|gu-5,7|gu-4,7|gu4,7|gu5,7|n10,7|n-8,6|n8,6|n-6,5|n6,5|n-4,4|k0,4|n4,4|n-2,3|n2,3|n0,2|N0,-1|N-2,-2|N2,-2|N-4,-3|K0,-3|N4,-3|N-6,-4|N6,-4|N-8,-5|N8,-5|N-10,-6|GU-5,-6|GU-4,-6|GU4,-6|GU5,-6|N10,-6|N-11,-8|N11,-8|HA-20,-9|P-19,-9+|P-17,-9+|P-14,-9+|P-12,-9+|P-11,-9+|P-9,-9+|P-8,-9+|P-6,-9+|P-5,-9+|P-3,-9+|P-2,-9+|P-1,-9+|P1,-9+|P2,-9+|P3,-9+|P5,-9+|P6,-9+|P8,-9+|P9,-9+|P11,-9+|P12,-9+|P14,-9+|P17,-9+|P19,-9+|HA20,-9|GU-20,-10|P-19,-10+|P-17,-10+|P-14,-10+|P-12,-10+|P-11,-10+|P-9,-10+|P-8,-10+|P-6,-10+|P-5,-10+|P-3,-10+|P-2,-10+|P-1,-10+|P1,-10+|P2,-10+|P3,-10+|P5,-10+|P6,-10+|P8,-10+|P9,-10+|P11,-10+|P12,-10+|P14,-10+|P17,-10+|P19,-10+|GU20,-10|P-19,-11+|B-18,-11|P-17,-11+|GU-16,-11|P-14,-11+|B-13,-11|P-12,-11+|P-11,-11+|P-9,-11+|P-8,-11+|P-6,-11+|P-5,-11+|P-3,-11+|P-2,-11+|P-1,-11+|P1,-11+|P2,-11+|P3,-11+|P5,-11+|P6,-11+|P8,-11+|P9,-11+|P11,-11+|P12,-11+|B13,-11|P14,-11+|GU16,-11|P17,-11+|B18,-11|P19,-11+|P-19,-12+|P-17,-12+|GU-16,-12|P-14,-12+|P-12,-12+|P-11,-12+|P-9,-12+|P-8,-12+|P-6,-12+|P-5,-12+|P-3,-12+|P-2,-12+|P-1,-12+|P1,-12+|P2,-12+|P3,-12+|P5,-12+|P6,-12+|P8,-12+|P9,-12+|P11,-12+|P12,-12+|P14,-12+|GU16,-12|P17,-12+|P19,-12+|GU-12,-13|P-11,-13+|P-10,-13+|P-9,-13+|P-8,-13+|P-7,-13+|P-6,-13+|P-5,-13+|P-3,-13+|P-2,-13+|P-1,-13+|P1,-13+|P2,-13+|P3,-13+|P5,-13+|P6,-13+|P7,-13+|P8,-13+|P9,-13+|P10,-13+|P11,-13+|GU12,-13|P-11,-14+|R-10,-14|P-9,-14+|P-8,-14+|R-7,-14|P-6,-14+|P-5,-14+|P-3,-14+|P-2,-14+|P-1,-14+|P1,-14+|P2,-14+|P3,-14+|P5,-14+|P6,-14+|R7,-14|P8,-14+|P9,-14+|R10,-14|P11,-14+|P-11,-15+|P-10,-15+|GU-9,-15|HA-8,-15|P-7,-15+|GU-6,-15|P-5,-15+|P-3,-15+|P-2,-15+|P-1,-15+|P1,-15+|P2,-15+|P3,-15+|P5,-15+|GU6,-15|P7,-15+|HA8,-15|GU9,-15|P10,-15+|P11,-15+|P-8,-16+|P-5,-16+|P-3,-16+|P-2,-16+|P-1,-16+|P1,-16+|P2,-16+|P3,-16+|P5,-16+|P8,-16+|P-5,-17+|P-3,-17+|P-2,-17+|P-1,-17+|P1,-17+|P2,-17+|P3,-17+|P5,-17+|P-5,-18+|P-4,-18+|P-3,-18+|P-2,-18+|P-1,-18+|P1,-18+|P2,-18+|P3,-18+|P4,-18+|P5,-18+|P-5,-19+|Q-4,-19|P-3,-19+|P-2,-19+|P-1,-19+|P1,-19+|P2,-19+|P3,-19+|Q4,-19|P5,-19+|P-5,-20+|P-4,-20+|P-3,-20+|P-2,-20+|P-1,-20+|P1,-20+|P2,-20+|P3,-20+|P4,-20+|P5,-20+|P-2,-21+|P-1,-21+|P1,-21+|P2,-21+|P-2,-22+|P-1,-22+|P0,-22+|P1,-22+|P2,-22+|P-2,-23+|P-1,-23+|AM0,-23|P1,-23+|P2,-23+|P-2,-24+|P-1,-24+|P0,-24+|P1,-24+|P2,-24+|P-1,-25+|P1,-25+";
          return getStartSnapshotPosition({ positionString });
        case "Containment":
          positionString = "K5,-5|k5,14|Q4,-5|q4,14|HA1,-6|HA8,-6|ha1,15|ha8,15|CH-6,-6|CH15,-6|ch-6,15|ch15,15|AR-6,-5|AR15,-5|ar-6,14|ar15,14|N-1,0|N1,0|N2,0|N4,-1|N5,-1|N7,0|N8,0|N10,0|n-1,9|n1,9|n2,9|n4,10|n5,10|n7,9|n8,9|n10,9|GU-2,-2|GU1,-3|GU3,-4|GU6,-4|GU8,-3|GU11,-2|gu-2,11|gu1,12|gu3,13|gu6,13|gu8,12|gu11,11|R-5,-6|R-5,-5|R-4,-5|R-4,-6|R13,-6|R13,-5|R14,-5|R14,-6|r-5,15|r-5,14|r-4,14|r-4,15|r13,15|r13,14|r14,14|r14,15|B-5,-2|B-4,-3|B-3,-2|B12,-2|B13,-3|B14,-2|b-5,11|b-4,12|b-3,11|b12,11|b13,12|b14,11|P-9,-8+|P-9,-6+|P-9,-4+|P-9,-2+|P-9,0+|P-9,2+|P-9,4+|P-9,6+|P-9,8+|P-9,10+|P-9,12+|P-9,14+|P-9,16+|P-8,-7+|P-8,-5+|P-8,-3+|P-8,-1+|P-8,1+|P-8,3+|P-8,5+|P-8,7+|P-8,9+|P-8,11+|P-8,13+|P-8,15+|P-8,17+|P17,-8+|P17,-6+|P17,-4+|P17,-2+|P17,0+|P17,2+|P17,4+|P17,6+|P17,8+|P17,10+|P17,12+|P17,14+|P17,16+|P18,-7+|P18,-5+|P18,-3+|P18,-1+|P18,1+|P18,3+|P18,5+|P18,7+|P18,9+|P18,11+|P18,13+|P18,15+|P18,17+|P-7,-8+|P-5,-8+|P-3,-8+|P-1,-8+|P1,-8+|P3,-8+|P5,-8+|P7,-8+|P9,-8+|P11,-8+|P13,-8+|P15,-8+|P-6,-7+|P-4,-7+|P-2,-7+|P0,-7+|P2,-7+|P4,-7+|P6,-7+|P8,-7+|P10,-7+|P12,-7+|P14,-7+|P16,-7+|P-7,16+|P-5,16+|P-3,16+|P-1,16+|P1,16+|P3,16+|P5,16+|P7,16+|P9,16+|P11,16+|P13,16+|P15,16+|P-6,17+|P-4,17+|P-2,17+|P0,17+|P2,17+|P4,17+|P6,17+|P8,17+|P10,17+|P12,17+|P14,17+|P16,17+|P-7,-6+|P-7,-4+|P-7,-2+|P-6,-2+|P-6,-1+|P-5,-1+|P-5,0+|P-5,-4+|P-4,-4+|P-4,-2+|P-4,-1+|P-3,-6+|P-3,-5+|P-3,-1+|P-3,0+|P-2,0+|P-2,1+|P-1,1+|P-1,-4+|P0,-3+|P1,-2+|P0,-1+|P0,1+|P1,1+|P2,1+|P3,1+|P3,0+|P3,-3+|P3,-5+|P4,-4+|P4,1+|P5,1+|P5,-4+|P6,-5+|P6,-3+|P6,0+|P6,1+|P7,1+|P8,1+|P9,1+|P9,-1+|P8,-2+|P9,-3+|P10,-4+|P10,1+|P11,1+|P11,0+|P12,0+|P12,-1+|P12,-5+|P12,-6+|P13,-4+|P13,-2+|P13,-1+|P14,0+|P14,-1+|P14,-4+|P15,-2+|P15,-1+|P16,-1+|P16,-3+|P16,-5+|p-9,-7+|p-9,-5+|p-9,-3+|p-9,-1+|p-9,1+|p-9,3+|p-9,5+|p-9,7+|p-9,9+|p-9,11+|p-9,13+|p-9,15+|p-9,17+|p-8,-8+|p-8,-6+|p-8,-4+|p-8,-2+|p-8,0+|p-8,2+|p-8,4+|p-8,6+|p-8,8+|p-8,10+|p-8,12+|p-8,14+|p-8,16+|p17,-7+|p17,-5+|p17,-3+|p17,-1+|p17,1+|p17,3+|p17,5+|p17,7+|p17,9+|p17,11+|p17,13+|p17,15+|p17,17+|p18,-8+|p18,-6+|p18,-4+|p18,-2+|p18,0+|p18,2+|p18,4+|p18,6+|p18,8+|p18,10+|p18,12+|p18,14+|p18,16+|p-6,-8+|p-4,-8+|p-2,-8+|p0,-8+|p2,-8+|p4,-8+|p6,-8+|p8,-8+|p10,-8+|p12,-8+|p14,-8+|p16,-8+|p-7,-7+|p-5,-7+|p-3,-7+|p-1,-7+|p1,-7+|p3,-7+|p5,-7+|p7,-7+|p9,-7+|p11,-7+|p13,-7+|p15,-7+|p-6,16+|p-4,16+|p-2,16+|p0,16+|p2,16+|p4,16+|p6,16+|p8,16+|p10,16+|p12,16+|p14,16+|p16,16+|p-7,17+|p-5,17+|p-3,17+|p-1,17+|p1,17+|p3,17+|p5,17+|p7,17+|p9,17+|p11,17+|p13,17+|p15,17+|p-7,15+|p-7,13+|p-7,11+|p-6,11+|p-6,10+|p-5,10+|p-5,9+|p-5,13+|p-4,13+|p-4,11+|p-4,10+|p-3,15+|p-3,14+|p-3,10+|p-3,9+|p-2,9+|p-2,8+|p-1,8+|p-1,13+|p0,12+|p1,11+|p0,10+|p0,8+|p1,8+|p2,8+|p3,8+|p3,9+|p3,12+|p3,14+|p4,13+|p4,8+|p5,8+|p5,13+|p6,14+|p6,12+|p6,9+|p6,8+|p7,8+|p8,8+|p9,8+|p9,10+|p8,11+|p9,12+|p10,13+|p10,8+|p11,8+|p11,9+|p12,9+|p12,10+|p12,14+|p12,15+|p13,13+|p13,11+|p13,10+|p14,9+|p14,10+|p14,13+|p15,11+|p15,10+|p16,10+|p16,12+|p16,14+";
          return getStartSnapshotPosition({ positionString });
        case "Classical_Limit_7":
          positionString = "P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "CoaIP_Limit_7":
          positionString = "P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|HA-2,-6|HA11,-6|ha-2,15|ha11,15|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "Chess":
          positionString = "vo-1,10|vo0,10|vo1,10|vo2,10|vo3,10|vo4,10|vo5,10|vo6,10|vo7,10|vo8,10|vo9,10|vo10,10|vo-1,9|vo0,9|vo1,9|vo2,9|vo3,9|vo4,9|vo5,9|vo6,9|vo7,9|vo8,9|vo9,9|vo10,9|vo-1,8|vo0,8|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|vo9,8|vo10,8|vo-1,7|vo0,7|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|vo9,7|vo10,7|vo-1,6|vo0,6|vo9,6|vo10,6|vo-1,5|vo0,5|vo9,5|vo10,5|vo-1,4|vo0,4|vo9,4|vo10,4|vo-1,3|vo0,3|vo9,3|vo10,3|vo-1,2|vo0,2|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|vo9,2|vo10,2|vo-1,1|vo0,1|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|vo9,1|vo10,1|vo-1,0|vo0,0|vo1,0|vo2,0|vo3,0|vo4,0|vo5,0|vo6,0|vo7,0|vo8,0|vo9,0|vo10,0|vo-1,-1|vo0,-1|vo1,-1|vo2,-1|vo3,-1|vo4,-1|vo5,-1|vo6,-1|vo7,-1|vo8,-1|vo9,-1|vo10,-1";
          return getStartSnapshotPosition({ positionString });
        case "Classical_KOTH":
          positionString = "P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|R1,1+|R8,1+|r1,8+|r8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "CoaIP_KOTH":
          positionString = "P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|HA-2,-6|HA11,-6|ha-2,15|ha11,15|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+";
          return getStartSnapshotPosition({ positionString });
        case "Classical_Plus":
          positionString = "p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p3,5+|p6,5+|P3,4+|P6,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+";
          return getStartSnapshotPosition({ positionString });
        case "Pawndard":
          positionString = "b4,14|b5,14|r4,12|r5,12|p2,10+|p3,10+|p6,10+|p7,10+|p1,9+|p8,9+|p0,8+|n2,8|n3,8|k4,8+|q5,8|n6,8|n7,8|p9,8+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|P1,5+|p2,5+|P3,5+|p6,5+|P7,5+|p8,5+|p1,4+|P2,4+|p3,4+|P6,4+|p7,4+|P8,4+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P0,1+|N2,1|N3,1|Q4,1|K5,1+|N6,1|N7,1|P9,1+|P1,0+|P8,0+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|R4,-3|R5,-3|B4,-5|B5,-5";
          return getStartSnapshotPosition({ positionString });
        case "Knightline":
          positionString = "k5,8+|n3,8|n4,8|n6,8|n7,8|p-5,7+|p-4,7+|p-3,7+|p-2,7+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,7+|p12,7+|p13,7+|p14,7+|p15,7+|K5,1+|N3,1|N4,1|N6,1|N7,1|P-5,2+|P-4,2+|P-3,2+|P-2,2+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,2+|P12,2+|P13,2+|P14,2+|P15,2+";
          return getStartSnapshotPosition({ positionString });
        case "Knighted_Chess":
          positionString = getPositionStringOfKnightedChess(UTCDate, UTCTime);
          return getStartSnapshotPosition({ positionString });
        case "Omega":
          positionString = "r-2,4|r2,4|r-2,2|r2,2|r-2,0|r0,0|r2,0|k0,-1|R1,-2|P-2,-3|Q-1,-3|P2,-3|K0,-4";
          return getStartSnapshotPosition({ positionString });
        case "Omega_Squared":
          positionString = "K51,94|k46,80|Q30,148|Q32,148|Q29,3|q29,148|q24,98|q24,97|q24,92|q24,91|q24,86|q24,85|q24,80|q24,79|q46,78|q45,77|q46,77|q45,76|q46,76|q78,60|N15,84|n63,64|r53,96|r45,81|r46,81|r46,79|r47,79|r45,78|B27,152|B29,152|B27,151|B28,151|B30,151|B32,151|B27,150|B28,150|B29,150|B30,150|B31,150|B32,150|B32,149|B9,96|B11,96|B15,96|B20,96|B47,87|B43,86|B44,82|B50,82|B51,81|B8,79|B10,79|B8,78|B10,78|B14,78|B19,78|B49,77|B41,72|B43,72|B45,72|B47,72|B49,72|B51,72|B53,72|B68,72|B10,71|B14,71|B18,71|B20,71|B22,71|B24,71|B76,55|B78,55|B80,55|B82,55|B84,55|B27,20|B29,20|B29,4|b27,155|b29,155|b31,155|b32,154|b9,99|b11,99|b15,99|b20,97|b33,97|b24,96|b11,92|b13,92|b15,92|b19,92|b47,91|b48,91|b49,91|b50,91|b51,91|b24,90|b47,90|b49,90|b51,90|b48,89|b50,89|b51,89|b47,88|b49,88|b51,88|b37,87|b48,87|b50,87|b51,87|b19,86|b49,86|b51,86|b48,85|b50,85|b24,84|b49,84|b51,84|b9,83|b48,83|b50,83|b51,82|b18,80|b14,79|b24,78|b52,77|b53,77|b47,76|b49,76|b51,76|b52,76|b53,76|b66,76|b70,76|b45,75|b47,75|b49,75|b51,75|b53,75|b10,74|b14,74|b18,74|b20,74|b22,74|b24,74|b58,74|b75,71|b78,58|b80,58|b82,58|b84,58|b27,23|b29,23|P26,155|P28,155|P30,155|P32,155|P27,154|P29,154|P31,154|P33,154|P26,153|P28,153|P30,153|P32,153|P26,152|P28,152|P31,152|P33,152|P26,151|P29,151|P31,151|P33,151|P26,150|P33,150|P26,149|P27,149|P28,149|P29,149|P30,149|P31,149|P33,149|P31,148|P33,148|P26,147|P28,147|P30,147|P31,147|P32,147|P33,147|P15,146|P27,146|P29,146|P28,145|P25,111|P24,110|P23,109|P22,108|P21,107|P25,107|P20,106|P24,106|P19,105|P23,105|P20,104|P19,103|P25,103|P20,102|P24,102|P19,101|P23,101|P20,100|P4,99|P6,99|P8,99|P10,99|P12,99|P14,99|P16,99|P19,99|P3,98|P5,98|P7,98|P9,98|P11,98|P15,98|P20,98|P4,97|P6,97|P8,97|P10,97|P12,97|P14,97|P16,97|P19,97|P21,97|P32,97|P34,97|P3,96|P5,96|P8,96|P10,96|P12,96|P33,96|P35,96|P4,95|P6,95|P8,95|P9,95|P10,95|P11,95|P12,95|P14,95|P16,95|P19,95|P21,95|P32,95|P34,95|P36,95|P23,94|P33,94|P35,94|P37,94|P8,93|P9,93|P34,93|P36,93|P38,93|P4,92|P6,92|P8,92|P10,92|P12,92|P14,92|P16,92|P18,92|P20,92|P35,92|P37,92|P39,92|P3,91|P5,91|P7,91|P9,91|P11,91|P13,91|P15,91|P19,91|P21,91|P36,91|P38,91|P40,91|P4,90|P6,90|P8,90|P10,90|P12,90|P14,90|P16,90|P18,90|P20,90|P35,90|P39,90|P41,90|P3,89|P5,89|P7,89|P9,89|P11,89|P13,89|P15,89|P19,89|P21,89|P34,89|P40,89|P42,89|P4,88|P6,88|P8,88|P10,88|P12,88|P14,88|P16,88|P23,88|P33,88|P37,88|P41,88|P43,88|P46,88|P48,88|P3,87|P5,87|P7,87|P9,87|P11,87|P13,87|P15,87|P32,87|P36,87|P38,87|P42,87|P44,87|P4,86|P6,86|P8,86|P10,86|P12,86|P14,86|P18,86|P20,86|P31,86|P35,86|P37,86|P39,86|P42,86|P44,86|P46,86|P48,86|P3,85|P5,85|P7,85|P9,85|P11,85|P13,85|P15,85|P17,85|P19,85|P21,85|P32,85|P36,85|P38,85|P40,85|P42,85|P43,85|P44,85|P3,84|P5,84|P7,84|P9,84|P11,84|P13,84|P18,84|P20,84|P33,84|P37,84|P39,84|P42,84|P43,84|P44,84|P52,84|P4,83|P6,83|P8,83|P10,83|P12,83|P14,83|P16,83|P19,83|P21,83|P34,83|P38,83|P40,83|P42,83|P43,83|P44,83|P49,83|P51,83|P3,82|P5,82|P7,82|P9,82|P11,82|P13,82|P15,82|P23,82|P31,82|P35,82|P39,82|P42,82|P43,82|P52,82|P2,81|P4,81|P6,81|P8,81|P10,81|P12,81|P14,81|P32,81|P38,81|P40,81|P42,81|P43,81|P44,81|P49,81|P3,80|P5,80|P7,80|P9,80|P11,80|P17,80|P19,80|P21,80|P31,80|P33,80|P37,80|P39,80|P50,80|P52,80|P2,79|P4,79|P7,79|P9,79|P11,79|P13,79|P15,79|P18,79|P20,79|P32,79|P34,79|P36,79|P38,79|P40,79|P44,79|P3,78|P5,78|P7,78|P9,78|P11,78|P17,78|P21,78|P33,78|P35,78|P37,78|P39,78|P41,78|P43,78|P2,77|P4,77|P7,77|P8,77|P9,77|P10,77|P11,77|P13,77|P15,77|P18,77|P20,77|P34,77|P36,77|P38,77|P40,77|P42,77|P23,76|P35,76|P37,76|P39,76|P41,76|P65,76|P67,76|P69,76|P71,76|P7,75|P8,75|P36,75|P38,75|P40,75|P42,75|P64,75|P66,75|P70,75|P3,74|P5,74|P7,74|P9,74|P11,74|P13,74|P15,74|P17,74|P19,74|P21,74|P23,74|P25,74|P37,74|P39,74|P41,74|P57,74|P59,74|P63,74|P65,74|P67,74|P69,74|P71,74|P2,73|P4,73|P6,73|P8,73|P10,73|P14,73|P18,73|P20,73|P22,73|P24,73|P38,73|P40,73|P42,73|P44,73|P46,73|P48,73|P50,73|P52,73|P54,73|P58,73|P62,73|P64,73|P66,73|P70,73|P72,73|P3,72|P5,72|P7,72|P9,72|P11,72|P13,72|P15,72|P17,72|P19,72|P21,72|P23,72|P25,72|P39,72|P57,72|P59,72|P61,72|P63,72|P65,72|P71,72|P2,71|P4,71|P6,71|P8,71|P40,71|P42,71|P44,71|P46,71|P48,71|P50,71|P52,71|P54,71|P58,71|P62,71|P64,71|P66,71|P70,71|P72,71|P74,71|P76,71|P3,70|P5,70|P7,70|P9,70|P11,70|P13,70|P15,70|P17,70|P19,70|P21,70|P23,70|P25,70|P57,70|P59,70|P61,70|P63,70|P65,70|P71,70|P75,70|P77,70|P56,69|P58,69|P62,69|P64,69|P72,69|P74,69|P76,69|P78,69|P57,68|P59,68|P61,68|P63,68|P67,68|P69,68|P75,68|P77,68|P79,68|P56,67|P58,67|P62,67|P66,67|P70,67|P74,67|P76,67|P78,67|P80,67|P57,66|P59,66|P64,66|P67,66|P69,66|P71,66|P75,66|P77,66|P79,66|P81,66|P56,65|P59,65|P63,65|P66,65|P70,65|P76,65|P78,65|P80,65|P82,65|P57,64|P59,64|P62,64|P65,64|P67,64|P69,64|P71,64|P73,64|P77,64|P79,64|P81,64|P83,64|P56,63|P58,63|P66,63|P70,63|P74,63|P78,63|P80,63|P82,63|P84,63|P57,62|P59,62|P61,62|P63,62|P65,62|P67,62|P69,62|P71,62|P73,62|P75,62|P79,62|P81,62|P83,62|P85,62|P56,61|P58,61|P60,61|P62,61|P64,61|P66,61|P70,61|P74,61|P76,61|P82,61|P84,61|P57,60|P59,60|P61,60|P63,60|P65,60|P67,60|P69,60|P71,60|P73,60|P75,60|P80,60|P82,60|P56,59|P58,59|P60,59|P62,59|P64,59|P66,59|P70,59|P74,59|P57,58|P59,58|P61,58|P63,58|P65,58|P73,58|P75,58|P58,57|P60,57|P62,57|P64,57|P74,57|P73,56|P75,56|P77,56|P79,56|P81,56|P83,56|P85,56|P74,55|P75,54|P77,54|P79,54|P81,54|P83,54|P85,54|P26,23|P28,23|P30,23|P27,22|P29,22|P26,21|P28,21|P30,21|P26,19|P28,19|P30,19|P26,18|P30,18|P26,17|P30,17|P26,16|P28,16|P30,16|P26,15|P28,15|P30,15|P26,14|P28,14|P30,14|P26,13|P28,13|P30,13|P26,12|P28,12|P30,12|P26,11|P28,11|P30,11|P26,10|P28,10|P30,10|P26,9|P28,9|P30,9|P26,8|P28,8|P30,8|P26,7|P28,7|P30,7|P26,6|P28,6|P30,6|P26,5|P28,5|P30,5|P26,4|P28,4|P30,4|P26,3|P28,3|P30,3|P26,2|P27,2|P28,2|P29,2|P30,2|p26,156|p28,156|p30,156|p32,156|p33,155|p26,154|p28,154|p30,154|p31,153|p33,153|p15,147|p25,112|p24,111|p23,110|p22,109|p25,109|p21,108|p25,108|p20,107|p24,107|p19,106|p23,106|p20,105|p25,105|p19,104|p25,104|p20,103|p24,103|p19,102|p23,102|p20,101|p25,101|p4,100|p6,100|p8,100|p10,100|p12,100|p14,100|p16,100|p19,100|p24,100|p25,100|p3,99|p5,99|p7,99|p20,99|p23,99|p24,99|p25,99|p4,98|p6,98|p8,98|p10,98|p12,98|p14,98|p16,98|p19,98|p21,98|p23,98|p25,98|p32,98|p34,98|p3,97|p5,97|p15,97|p23,97|p25,97|p35,97|p4,96|p6,96|p14,96|p16,96|p19,96|p21,96|p23,96|p25,96|p32,96|p34,96|p36,96|p18,95|p23,95|p25,95|p33,95|p35,95|p37,95|p25,94|p34,94|p36,94|p38,94|p4,93|p6,93|p10,93|p12,93|p14,93|p16,93|p18,93|p20,93|p23,93|p24,93|p25,93|p35,93|p37,93|p39,93|p3,92|p5,92|p7,92|p9,92|p21,92|p23,92|p25,92|p36,92|p38,92|p40,92|p46,92|p47,92|p48,92|p49,92|p50,92|p51,92|p52,92|p4,91|p6,91|p8,91|p10,91|p12,91|p14,91|p16,91|p18,91|p20,91|p23,91|p25,91|p35,91|p39,91|p41,91|p46,91|p52,91|p3,90|p5,90|p7,90|p9,90|p11,90|p13,90|p15,90|p19,90|p21,90|p23,90|p25,90|p34,90|p40,90|p42,90|p46,90|p48,90|p50,90|p52,90|p4,89|p6,89|p8,89|p10,89|p12,89|p14,89|p16,89|p23,89|p25,89|p33,89|p37,89|p41,89|p43,89|p46,89|p52,89|p3,88|p5,88|p7,88|p9,88|p11,88|p13,88|p15,88|p25,88|p32,88|p36,88|p38,88|p42,88|p44,88|p50,88|p52,88|p4,87|p6,87|p8,87|p10,87|p12,87|p14,87|p18,87|p20,87|p23,87|p24,87|p25,87|p31,87|p35,87|p39,87|p46,87|p52,87|p3,86|p5,86|p7,86|p9,86|p11,86|p13,86|p15,86|p17,86|p21,86|p23,86|p25,86|p32,86|p36,86|p38,86|p40,86|p47,86|p50,86|p52,86|p18,85|p20,85|p23,85|p25,85|p33,85|p37,85|p39,85|p46,85|p47,85|p49,85|p52,85|p4,84|p6,84|p8,84|p10,84|p12,84|p14,84|p16,84|p19,84|p21,84|p23,84|p25,84|p34,84|p38,84|p40,84|p46,84|p47,84|p3,83|p5,83|p7,83|p11,83|p13,83|p15,83|p23,83|p25,83|p31,83|p35,83|p39,83|p46,83|p47,83|p52,83|p2,82|p4,82|p6,82|p8,82|p10,82|p12,82|p14,82|p25,82|p32,82|p38,82|p40,82|p46,82|p47,82|p49,82|p3,81|p5,81|p7,81|p9,81|p11,81|p13,81|p15,81|p17,81|p19,81|p21,81|p23,81|p24,81|p25,81|p31,81|p33,81|p37,81|p39,81|p47,81|p50,81|p52,81|p2,80|p4,80|p13,80|p15,80|p20,80|p23,80|p25,80|p32,80|p34,80|p36,80|p38,80|p40,80|p44,80|p47,80|p3,79|p5,79|p17,79|p19,79|p21,79|p23,79|p25,79|p33,79|p35,79|p37,79|p39,79|p41,79|p43,79|p45,79|p2,78|p4,78|p13,78|p15,78|p18,78|p20,78|p23,78|p25,78|p34,78|p36,78|p38,78|p40,78|p42,78|p44,78|p47,78|p49,78|p51,78|p52,78|p53,78|p54,78|p17,77|p23,77|p25,77|p35,77|p37,77|p39,77|p41,77|p44,77|p47,77|p48,77|p50,77|p51,77|p54,77|p65,77|p67,77|p69,77|p71,77|p25,76|p36,76|p38,76|p40,76|p42,76|p44,76|p48,76|p50,76|p54,76|p64,76|p3,75|p5,75|p9,75|p11,75|p13,75|p15,75|p17,75|p19,75|p21,75|p23,75|p25,75|p37,75|p39,75|p41,75|p44,75|p46,75|p48,75|p50,75|p52,75|p54,75|p57,75|p59,75|p63,75|p65,75|p67,75|p69,75|p71,75|p2,74|p4,74|p6,74|p8,74|p38,74|p40,74|p42,74|p44,74|p46,74|p48,74|p50,74|p52,74|p54,74|p62,74|p64,74|p66,74|p70,74|p72,74|p3,73|p5,73|p7,73|p9,73|p11,73|p13,73|p15,73|p17,73|p19,73|p21,73|p23,73|p25,73|p39,73|p41,73|p43,73|p45,73|p47,73|p49,73|p51,73|p53,73|p57,73|p59,73|p61,73|p63,73|p65,73|p71,73|p2,72|p4,72|p6,72|p8,72|p10,72|p14,72|p18,72|p20,72|p22,72|p24,72|p40,72|p42,72|p44,72|p46,72|p48,72|p50,72|p52,72|p54,72|p58,72|p62,72|p64,72|p66,72|p70,72|p72,72|p74,72|p76,72|p3,71|p5,71|p7,71|p9,71|p11,71|p13,71|p15,71|p17,71|p19,71|p21,71|p23,71|p25,71|p53,71|p57,71|p59,71|p61,71|p63,71|p65,71|p71,71|p77,71|p56,70|p58,70|p62,70|p64,70|p67,70|p69,70|p72,70|p74,70|p76,70|p78,70|p57,69|p59,69|p61,69|p63,69|p67,69|p69,69|p75,69|p77,69|p79,69|p56,68|p58,68|p62,68|p66,68|p70,68|p74,68|p76,68|p78,68|p80,68|p57,67|p59,67|p64,67|p67,67|p69,67|p71,67|p75,67|p77,67|p79,67|p81,67|p56,66|p63,66|p66,66|p70,66|p73,66|p76,66|p78,66|p80,66|p82,66|p57,65|p62,65|p65,65|p67,65|p69,65|p71,65|p73,65|p77,65|p79,65|p81,65|p83,65|p56,64|p58,64|p61,64|p66,64|p70,64|p74,64|p78,64|p80,64|p82,64|p84,64|p57,63|p59,63|p61,63|p63,63|p65,63|p67,63|p69,63|p71,63|p73,63|p75,63|p79,63|p81,63|p83,63|p85,63|p56,62|p58,62|p60,62|p62,62|p64,62|p66,62|p70,62|p74,62|p76,62|p80,62|p82,62|p84,62|p57,61|p59,61|p61,61|p63,61|p65,61|p67,61|p69,61|p71,61|p73,61|p75,61|p77,61|p78,61|p80,61|p56,60|p58,60|p60,60|p62,60|p64,60|p66,60|p70,60|p74,60|p77,60|p79,60|p57,59|p59,59|p61,59|p63,59|p65,59|p73,59|p75,59|p77,59|p78,59|p79,59|p80,59|p81,59|p82,59|p83,59|p84,59|p85,59|p58,58|p60,58|p62,58|p64,58|p74,58|p77,58|p79,58|p81,58|p83,58|p85,58|p73,57|p75,57|p77,57|p79,57|p81,57|p83,57|p85,57|p74,56|p76,56|p78,56|p80,56|p82,56|p84,56|p75,55|p77,55|p79,55|p81,55|p83,55|p85,55|p26,24|p28,24|p30,24|p26,22|p28,22|p30,22|p27,21|p29,21|p26,20|p28,20|p30,20|p28,17";
          return getStartSnapshotPosition({ positionString });
        case "Omega_Cubed":
          startingPosition = variantomega.genPositionOfOmegaCubed();
          return getStartSnapshotPosition({ startingPosition, pawnDoublePush: false, castleWith: null });
        case "Omega_Fourth":
          startingPosition = variantomega.genPositionOfOmegaFourth();
          return getStartSnapshotPosition({ startingPosition, pawnDoublePush: false, castleWith: null });
        // Removed...
        /*
        case "Standarch - 3 Check":
            positionString = 'p4,11+|p5,11+|p1,10+|p2,10+|p3,10+|p6,10+|p7,10+|p8,10+|p0,9+|ar4,9|ch5,9|p9,9+|p0,8+|r1,8+|n2,8|b3,8|q4,8|k5,8+|b6,8|n7,8|r8,8+|p9,8+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P0,1+|R1,1+|N2,1|B3,1|Q4,1|K5,1+|B6,1|N7,1|R8,1+|P9,1+|P0,0+|AR4,0|CH5,0|P9,0+|P1,-1+|P2,-1+|P3,-1+|P6,-1+|P7,-1+|P8,-1+|P4,-2+|P5,-2+'
            return getStartSnapshotPosition({ positionString })
        case "CoaIP - 3 Check":
            positionString = 'P-2,1+|P-1,2+|P0,2+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P9,2+|P10,2+|P11,1+|P-4,-6+|P-3,-5+|P-2,-4+|P-1,-5+|P0,-6+|P9,-6+|P10,-5+|P11,-4+|P12,-5+|P13,-6+|p-2,8+|p-1,7+|p0,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p9,7+|p10,7+|p11,8+|p-4,15+|p-3,14+|p-2,13+|p-1,14+|p0,15+|p9,15+|p10,14+|p11,13+|p12,14+|p13,15+|HA-2,-6|HA11,-6|ha-2,15|ha11,15|R-1,1|R10,1|r-1,8|r10,8|CH0,1|CH9,1|ch0,8|ch9,8|GU1,1+|GU8,1+|gu1,8+|gu8,8+|N2,1|N7,1|n2,8|n7,8|B3,1|B6,1|b3,8|b6,8|Q4,1|q4,8|K5,1+|k5,8+'
            return getStartSnapshotPosition({ positionString })
            */
        default:
          throw new Error(`Unknown variant "${Variant}"`);
      }
    }
    function getPositionStringOfSpaceClassic(UTCDate, UTCTime) {
      const UTCTimeStamp = UTCDate ? math2.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime) : Date.now();
      if (UTCTimeStamp < 17090172e5) return "p-3,15+|q4,15|p11,15+|p-4,14+|b4,14|p12,14+|p-5,13+|r2,13|b4,13|r6,13|p13,13+|p3,5+|p4,5+|p5,5+|n3,4|k4,4|n5,4|p-6,3+|p1,3+|p2,3+|p3,3+|p4,3+|p5,3+|p6,3+|p7,3+|p-8,2+|p-7,2+|p15,2+|p16,2+|p-9,1+|p17,1+|P-9,0+|P17,0+|P-8,-1+|P-7,-1+|P15,-1+|P16,-1+|P1,-2+|P2,-2+|P3,-2+|P4,-2+|P5,-2+|P6,-2+|P7,-2+|P14,-2+|N3,-3|K4,-3|N5,-3|P3,-4+|P4,-4+|P5,-4+|P-5,-12+|R2,-12|B4,-12|R6,-12|P13,-12+|P-4,-13+|B4,-13|P12,-13+|P-3,-14+|Q4,-14|P11,-14+";
      else return "p-3,18+|r2,18|b4,18|b5,18|r7,18|p12,18+|p-4,17+|p13,17+|p-5,16+|p14,16+|p3,9+|p4,9+|p5,9+|p6,9+|n3,8|k4,8|q5,8|n6,8|p-6,7+|p1,7+|p2,7+|p3,7+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p-8,6+|p-7,6+|p16,6+|p17,6+|p-9,5+|p18,5+|P-9,4+|P18,4+|P-8,3+|P-7,3+|P16,3+|P17,3+|P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|P15,2+|N3,1|K4,1|Q5,1|N6,1|P3,0+|P4,0+|P5,0+|P6,0+|P-5,-7+|P14,-7+|P-4,-8+|P13,-8+|P-3,-9+|R2,-9|B4,-9|B5,-9|R7,-9|P12,-9+";
    }
    function getPositionStringOfKnightedChess(UTCDate, UTCTime) {
      const UTCTimeStamp = UTCDate ? math2.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime) : Date.now();
      if (UTCTimeStamp < 17224704e5) return "P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|N2,1|N7,1|n2,8|n7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+";
      else return "P1,2+|P2,2+|P3,2+|P4,2+|P5,2+|P6,2+|P7,2+|P8,2+|p1,7+|p2,7+|p3,7+|P0,1+|P1,0+|P2,0+|P3,0+|P6,0+|P7,0+|P8,0+|P9,1+|p4,7+|p5,7+|p6,7+|p7,7+|p8,7+|p0,8+|p1,9+|p2,9+|p3,9+|p6,9+|p7,9+|p8,9+|p9,8+|CH1,1+|CH8,1+|ch1,8+|ch8,8+|NR2,1|NR7,1|nr2,8|nr7,8|AR3,1|AR6,1|ar3,8|ar6,8|AM4,1|am4,8|RC5,1+|rc5,8+";
    }
    function getStartSnapshotPosition({ positionString, startingPosition, specialRights, pawnDoublePush, castleWith }) {
      if (positionString) {
        if (!startingPosition) {
          const positionAndRights = formatconverter2.getStartingPositionAndSpecialRightsFromShortPosition(positionString);
          startingPosition = positionAndRights.startingPosition;
          specialRights = positionAndRights.specialRights;
        }
      } else if (startingPosition && specialRights) {
        positionString = formatconverter2.LongToShort_Position(startingPosition, specialRights);
      } else if (startingPosition) {
        specialRights = formatconverter2.generateSpecialRights(startingPosition, pawnDoublePush, castleWith);
        positionString = formatconverter2.LongToShort_Position(startingPosition, specialRights);
      } else {
        return console.error("Not enough information to calculate the positionString, position, and specialRights of variant.");
      }
      return { positionString, position: startingPosition, specialRights };
    }
    function getGameRulesOfVariant({ Variant, UTCDate = math2.getCurrentUTCDate(), UTCTime = math2.getCurrentUTCTime() }, position) {
      if (!position) position = getStartingPositionOfVariant({ Variant }).position;
      switch (Variant) {
        case "Classical":
          return getGameRules({ position });
        case "Core":
          return getGameRules({ position });
        case "Standarch":
          return getGameRules({ position });
        case "Space_Classic": {
          const UTCTimeStamp = math2.convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime);
          const promotionRanks = UTCTimeStamp < 17090172e5 ? [4, -3] : void 0;
          return getGameRules({ promotionRanks, position });
        }
        case "CoaIP":
          return getGameRules({ position });
        case "Pawn_Horde":
          return getGameRules({ winConditions: { white: ["checkmate"], black: ["allpiecescaptured"] }, promotionRanks: [2, -7], position });
        case "Space":
          return getGameRules({ promotionRanks: [4, -3], position });
        case "Obstocean":
          return getGameRules({ position });
        case "Abundance":
          return getGameRules({ promotionRanks: [6, -6], position });
        case "Amazon_Chandelier":
          return getGameRules({ promotionRanks: [10, -9], position });
        case "Containment":
          return getGameRules({ promotionRanks: null, position });
        case "Classical_Limit_7":
          return getGameRules({ slideLimit: 7, position });
        case "CoaIP_Limit_7":
          return getGameRules({ slideLimit: 7, position });
        case "Chess":
          return getGameRules({ position });
        case "Classical_KOTH":
          return getGameRules({ winConditions: getWinConditionsOfKOTH(), position });
        case "CoaIP_KOTH":
          return getGameRules({ winConditions: getWinConditionsOfKOTH(), position });
        case "Classical_Plus":
          return getGameRules({ position });
        case "Pawndard":
          return getGameRules({ position });
        case "Knightline":
          return getGameRules({ promotionsAllowed: { white: ["knights", "queens"], black: ["knights", "queens"] } });
        case "Knighted_Chess":
          return getGameRules({ position });
        case "Omega":
          return getGameRules({ promotionRanks: null, moveRule: null, position, turnOrder: getTurnOrderOfOmega() });
        case "Omega_Squared":
          return getGameRules({ promotionRanks: null, moveRule: null, position, turnOrder: getTurnOrderOfOmega() });
        case "Omega_Cubed":
          return getGameRules({ promotionRanks: null, moveRule: null, position, turnOrder: getTurnOrderOfOmega() });
        case "Omega_Fourth":
          return getGameRules({ promotionRanks: null, moveRule: null, position, turnOrder: getTurnOrderOfOmega() });
        // Removed...
        /*
        case "Standarch - 3 Check":
            return getGameRules({ winConditions: getWinConditionsOfThreeCheck(), position });
        case "CoaIP - 3 Check":
            return getGameRules({ winConditions: getWinConditionsOfThreeCheck(), position });
            */
        default:
          throw new Error(`Unknown variant "${Variant}"`);
      }
    }
    function getPromotionsAllowed(position, promotionRanks) {
      const unallowedPromotes = math2.deepCopyObject(pieces.royals);
      unallowedPromotes.push("pawns");
      const white = [];
      const black = [];
      if (!promotionRanks) return { white, black };
      for (const key in position) {
        const thisPieceType = position[key];
        if (thisPieceType.endsWith("N")) continue;
        const trimmedType = math2.trimWorBFromType(thisPieceType);
        if (unallowedPromotes.includes(trimmedType)) continue;
        if (white.includes(trimmedType)) continue;
        if (promotionRanks[0] != null) white.push(trimmedType);
        if (promotionRanks[1] != null) black.push(trimmedType);
      }
      return { white, black };
    }
    function initClassical(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Classical" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initCore(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Core" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initStandarch(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Standarch" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initSpaceClassic(gamefile2, { Variant, UTCDate, UTCTime }) {
      gamefile2.metadata.UTCDate = UTCDate;
      gamefile2.metadata.UTCTime = UTCTime;
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Space_Classic", UTCDate, UTCTime });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initCoaip(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "CoaIP" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initPawnHorde(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Pawn_Horde" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initSpace(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Space" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initObstocean(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Obstocean" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initAbundance(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Abundance" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initAmazonChandelier(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Amazon_Chandelier" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initContainment(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Containment" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initChess(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Chess" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initClassicalPlus(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Classical_Plus" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initPawndard(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Pawndard" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initKnightline(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Knightline" });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    function initKnightedChess(gamefile2, { Variant, UTCDate, UTCTime }) {
      const { position, positionString, specialRights } = getStartingPositionOfVariant({ Variant: "Knighted_Chess", UTCDate, UTCTime });
      gamefile2.startSnapshot = {
        position,
        positionString,
        specialRights,
        turn: "white"
      };
      gamefile2.gameRules = getGameRulesOfVariant({ Variant, UTCDate, UTCTime }, position);
    }
    return Object.freeze({
      setupVariant,
      getGameRules,
      getGameRulesOfVariant,
      getBareMinimumGameRules,
      getStartingPositionOfVariant,
      getDefaultWinConditions,
      isVariantValid,
      getPromotionsAllowed
    });
  }();

  // src/client/scripts/game/chess/gamefile.mjs
  function gamefile(metadata, { moves = [], variantOptions, gameConclusion } = {}) {
    this.metadata = {
      Variant: void 0,
      White: void 0,
      Black: void 0,
      TimeControl: void 0,
      UTCDate: void 0,
      UTCTime: void 0,
      /** 1-0 = White won */
      Result: void 0,
      /** What caused the game to end, in spoken language. For example, "Time forfeit". This will always be the win condition that concluded the game. */
      Termination: void 0,
      /** What kind of game (rated/casual), and variant, in spoken language. For example, "Casual local Classical infinite chess game" */
      Event: void 0,
      /** What website hosted the game. "https://www.infinitechess.org/" */
      Site: void 0
    };
    this.startSnapshot = {
      /** In key format 'x,y':'type' */
      position: void 0,
      positionString: void 0,
      specialRights: void 0,
      /** What square coords, if legal, enpassant capture is possible in the starting position of the game. */
      enpassant: void 0,
      /** The state of the move-rule at the start of the game (how many plies have passed since a capture or pawn push) */
      moveRuleState: void 0,
      /** This is the full-move number at the start of the game. Used for converting to ICN notation. */
      fullMove: void 0,
      /** The number of players in this game (the number of unique colors in the turn order) */
      playerCount: void 0,
      /** The count of pieces the game started with. */
      pieceCount: void 0,
      /** The bounding box surrounding the starting position, without padding.
       * @type {BoundingBox} */
      box: void 0,
      /** A set of all types of pieces that are in this game, without their color extension: `['pawns','queens']` */
      existingTypes: void 0,
      /** Possible sliding moves in this game, dependant on what pieces there are: `[[1,1],[1,0]]` @type {number[][]}*/
      slidingPossible: void 0
    };
    this.gameRules = {
      winConditions: void 0,
      promotionRanks: void 0,
      promotionsAllowed: {
        /** An array of types white can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
        white: void 0,
        /** An array of types black can promote to, with the W/B removed from the end: `['queens','rooks']` @type {Array} */
        black: void 0
      },
      slideLimit: void 0,
      /** An array of teams: `['white','black']` @type {string[]} */
      turnOrder: void 0,
      /** How many plies (half-moves) may pass until a draw is automatically pronounced! */
      moveRule: void 0
    };
    this.ourPieces = void 0;
    this.piecesOrganizedByKey = void 0;
    this.piecesOrganizedByLines = void 0;
    this.mesh = {
      /** A Float64Array for retaining higher precision arithmetic, but these values
       * need to be transferred into `data32` before contructing/updating the model. */
      data64: void 0,
      /** The Float32Array of vertex data that goes into the contruction of the model. */
      data32: void 0,
      /** A Float64Array for retaining higher precision of the pieces, rotated 180°, but these values
       * need to be transferred into `data32` before contructing/updating the model. */
      rotatedData64: void 0,
      /** The Float32Array of vertex data, that goes into the contruction of the model, rotated 180°. */
      rotatedData32: void 0,
      /** The buffer model of the pieces (excluding voids).
       * @type {BufferModel} */
      model: void 0,
      /** The buffer model of the pieces, rotated 180°.
       * @type {BufferModel} */
      rotatedModel: void 0,
      /** *true* if the model is using the coloredTextureProgram instead of the textureProgram. */
      usingColoredTextures: void 0,
      /** The stride-length of the vertex data within the Float32Array making up the model.
       * This is effected by how many floats each point uses for position, texture coords, and color. */
      stride: void 0,
      /** The amount the mesh data has been linearly shifted to make it closer to the origin, in coordinates `[x,y]`.
       * This helps require less severe uniform translations upon rendering when traveling massive distances.
       * The amount it is shifted depends on the nearest `regenRange`. */
      offset: void 0,
      /** A number for whether the mesh of the pieces is currently being generated.
       * @type {number} 0+. When > 0, is it generating. */
      isGenerating: 0,
      /** A number representing whether the mesh of the pieces is currently locked or not.
       * Don't perform actions that would otherwise modify the piece list,
       * such as rewinding/forwarding the game, moving a piece, etc..
       * It can lock when we are generating the mesh, or looking for legal moves.
       * @type {number} 0+. When > 0, the mesh is locked. */
      locked: 0,
      /** Call when unloading the game, as we don't need to finish the mesh generation, this immediately terminates it. */
      terminateIfGenerating: () => {
        if (this.mesh.isGenerating) this.mesh.terminate = true;
      },
      /** A flag the mesh generation reads to know whether to terminate or not.
       * Do ***NOT*** set manually, call `terminateIfGenerating()` instead. */
      terminate: false
    };
    this.voidMesh = {
      /** High precision Float64Array for performing arithmetic. */
      data64: void 0,
      /** Low precision Float32Array for passing into gpu. */
      data32: void 0,
      /** The buffer model of the void squares. These are rendered separately
       * from the pieces because we can simplify the mesh greatly.
       * @type {BufferModel} */
      model: void 0
    };
    this.pieceMovesets = void 0;
    this.vicinity = void 0;
    this.specialDetects = void 0;
    this.specialMoves = void 0;
    this.specialUndos = void 0;
    math2.copyPropertiesToObject(metadata, this.metadata);
    variant.setupVariant(this, metadata, variantOptions);
    this.moveRuleState = this.gameRules.moveRule ? this.startSnapshot.moveRuleState : void 0;
    area.initStartingAreaBox(this);
    this.moves = [];
    this.moveIndex = -1;
    this.enpassant = math2.deepCopyObject(this.startSnapshot.enpassant);
    this.specialRights = math2.deepCopyObject(this.startSnapshot.specialRights);
    this.whosTurn = this.gameRules.turnOrder[0];
    this.inCheck = false;
    this.attackers = void 0;
    this.checksGiven = void 0;
    this.ourPieces = organizedlines2.buildStateFromKeyList(this.startSnapshot.position);
    this.startSnapshot.pieceCount = gamefileutility2.getPieceCountOfGame(this);
    organizedlines2.initOrganizedPieceLists(this, { appendUndefineds: false });
    movepiece.makeAllMovesInGame(this, moves);
    this.gameConclusion = gameConclusion || this.gameConclusion;
    organizedlines2.addMoreUndefineds(this, { regenModel: false });
  }

  // src/client/scripts/game/gui/guiplay.mjs
  var guiplay = function() {
    const element_menuExternalLinks = document.getElementById("menu-external-links");
    const element_PlaySelection = document.getElementById("play-selection");
    const element_playName = document.getElementById("play-name");
    const element_playBack = document.getElementById("play-back");
    const element_online = document.getElementById("online");
    const element_local = document.getElementById("local");
    const element_computer = document.getElementById("computer");
    const element_createInvite = document.getElementById("create-invite");
    const element_optionCardColor = document.getElementById("option-card-color");
    const element_optionCardPrivate = document.getElementById("option-card-private");
    const element_optionCardRated = document.getElementById("option-card-rated");
    const element_optionVariant = document.getElementById("option-variant");
    const element_optionClock = document.getElementById("option-clock");
    const element_optionColor = document.getElementById("option-color");
    const element_optionPrivate = document.getElementById("option-private");
    const element_optionRated = document.getElementById("option-rated");
    const element_joinPrivate = document.getElementById("join-private");
    const element_inviteCode = document.getElementById("invite-code");
    const element_copyInviteCode = document.getElementById("copy-button");
    const element_joinPrivateMatch = document.getElementById("join-button");
    const element_textboxPrivate = document.getElementById("textbox-private");
    let pageIsOpen = false;
    let modeSelected;
    const indexOf10m = 5;
    const indexOfInfiniteTime = 12;
    let createInviteButtonIsLocked = false;
    let acceptInviteButtonIsLocked = false;
    function isOpen() {
      return pageIsOpen;
    }
    function getModeSelected() {
      return modeSelected;
    }
    function hideElement_joinPrivate() {
      style.hideElement(element_joinPrivate);
    }
    function showElement_joinPrivate() {
      style.revealElement(element_joinPrivate);
    }
    function hideElement_inviteCode() {
      style.hideElement(element_inviteCode);
    }
    function showElement_inviteCode() {
      style.revealElement(element_inviteCode);
    }
    function open() {
      pageIsOpen = true;
      gui.setScreen("title play");
      style.revealElement(element_PlaySelection);
      style.revealElement(element_menuExternalLinks);
      changePlayMode("online");
      initListeners();
      invites.subscribeToInvites();
    }
    function close() {
      pageIsOpen = false;
      style.hideElement(element_PlaySelection);
      style.hideElement(element_menuExternalLinks);
      hideElement_inviteCode();
      closeListeners();
      websocket.unsubFromInvites();
    }
    function initListeners() {
      element_playBack.addEventListener("click", callback_playBack);
      element_online.addEventListener("click", callback_online);
      element_local.addEventListener("click", callback_local);
      element_computer.addEventListener("click", gui.callback_featurePlanned);
      element_createInvite.addEventListener("click", callback_createInvite);
      element_optionColor.addEventListener("change", callback_updateOptions);
      element_optionClock.addEventListener("change", callback_updateOptions);
      element_joinPrivateMatch.addEventListener("click", callback_joinPrivate);
      element_copyInviteCode.addEventListener("click", callback_copyInviteCode);
      element_textboxPrivate.addEventListener("keyup", callback_textboxPrivateEnter);
    }
    function closeListeners() {
      element_playBack.removeEventListener("click", callback_playBack);
      element_online.removeEventListener("click", callback_online);
      element_local.removeEventListener("click", callback_local);
      element_computer.removeEventListener("click", gui.callback_featurePlanned);
      element_createInvite.removeEventListener("click", callback_createInvite);
      element_optionColor.removeEventListener("change", callback_updateOptions);
      element_optionClock.removeEventListener("change", callback_updateOptions);
      element_joinPrivateMatch.removeEventListener("click", callback_joinPrivate);
      element_copyInviteCode.removeEventListener("click", callback_copyInviteCode);
      element_textboxPrivate.removeEventListener("keyup", callback_textboxPrivateEnter);
    }
    function changePlayMode(mode) {
      if (mode === "online" && createInviteButtonIsLocked) disableCreateInviteButton();
      if (mode !== "online" && invites.doWeHave()) element_createInvite.click();
      modeSelected = mode;
      if (mode === "online") {
        element_playName.textContent = translations["menu_online"];
        element_online.classList.add("selected");
        element_local.classList.remove("selected");
        element_online.classList.remove("not-selected");
        element_local.classList.add("not-selected");
        element_createInvite.textContent = translations["invites"]["create_invite"];
        element_optionCardColor.classList.remove("hidden");
        element_optionCardRated.classList.remove("hidden");
        element_optionCardPrivate.classList.remove("hidden");
        const localStorageClock = localstorage2.loadItem("preferred_online_clock_invite_value");
        element_optionClock.selectedIndex = localStorageClock !== void 0 ? localStorageClock : indexOf10m;
        element_joinPrivate.classList.remove("hidden");
      } else if (mode === "local") {
        enableCreateInviteButton();
        element_playName.textContent = translations["menu_local"];
        element_online.classList.remove("selected");
        element_local.classList.add("selected");
        element_online.classList.add("not-selected");
        element_local.classList.remove("not-selected");
        element_createInvite.textContent = translations["invites"]["start_game"];
        element_optionCardColor.classList.add("hidden");
        element_optionCardRated.classList.add("hidden");
        element_optionCardPrivate.classList.add("hidden");
        const localStorageClock = localstorage2.loadItem("preferred_local_clock_invite_value");
        element_optionClock.selectedIndex = localStorageClock !== void 0 ? localStorageClock : indexOfInfiniteTime;
        element_joinPrivate.classList.add("hidden");
        element_inviteCode.classList.add("hidden");
      }
    }
    function callback_playBack() {
      close();
      guititle.open();
    }
    function callback_online() {
      changePlayMode("online");
    }
    function callback_local() {
      changePlayMode("local");
    }
    function callback_createInvite() {
      const gameOptions = {
        variant: element_optionVariant.value,
        clock: element_optionClock.value,
        color: element_optionColor.value,
        rated: element_optionRated.value,
        publicity: element_optionPrivate.value
      };
      if (modeSelected === "local") {
        close();
        startLocalGame(gameOptions);
      } else if (modeSelected === "online") {
        if (invites.doWeHave()) invites.cancel();
        else invites.create(gameOptions);
      }
    }
    function callback_updateOptions() {
      savePreferredClockOption(element_optionClock.selectedIndex);
      if (modeSelected !== "online") return;
      const clockValue = element_optionClock.value;
      const colorValue = element_optionColor.value;
      if (clockValue === "0" || colorValue !== "Random") element_optionRated.disabled = true;
      else element_optionRated.disabled = false;
    }
    function savePreferredClockOption(clockIndex) {
      const localOrOnline = modeSelected;
      localstorage2.saveItem(`preferred_${localOrOnline}_clock_invite_value`, clockIndex, math2.getTotalMilliseconds({ days: 7 }));
    }
    function callback_joinPrivate() {
      const code = element_textboxPrivate.value.toLowerCase();
      if (code.length !== 5) return statustext2.showStatus(translations["invite_error_digits"]);
      element_joinPrivateMatch.disabled = true;
      const isPrivate = true;
      invites.accept(code, isPrivate);
    }
    function callback_textboxPrivateEnter() {
      if (event.keyCode === 13) {
        if (!element_joinPrivateMatch.disabled) callback_joinPrivate(event);
      } else element_joinPrivateMatch.disabled = false;
    }
    function callback_copyInviteCode() {
      if (!modeSelected.includes("online")) return;
      if (!invites.doWeHave()) return;
      const code = invites.gelement_iCodeCode().textContent;
      main2.copyToClipboard(code);
      statustext2.showStatus(translations["invite_copied"]);
    }
    function initListeners_Invites() {
      const invites2 = document.querySelectorAll(".invite");
      invites2.forEach((element) => {
        element.addEventListener("mouseenter", callback_inviteMouseEnter);
        element.addEventListener("mouseleave", callback_inviteMouseLeave);
        element.addEventListener("click", callback_inviteClicked);
      });
    }
    function closeListeners_Invites() {
      const invites2 = document.querySelectorAll(".invite");
      invites2.forEach((element) => {
        element.removeEventListener("mouseenter", callback_inviteMouseEnter);
        element.removeEventListener("mouseleave", callback_inviteMouseLeave);
        element.removeEventListener("click", callback_inviteClicked);
      });
    }
    function callback_inviteMouseEnter() {
      event.target.classList.add("hover");
    }
    function callback_inviteMouseLeave() {
      event.target.classList.remove("hover");
    }
    function callback_inviteClicked(event2) {
      invites.click(event2.currentTarget);
    }
    function startLocalGame(inviteOptions) {
      gui.setScreen("game local");
      const gameOptions = {
        metadata: {
          Event: `Casual local ${translations[inviteOptions.variant]} infinite chess game`,
          Site: "https://www.infinitechess.org/",
          Round: "-",
          Variant: inviteOptions.variant,
          TimeControl: inviteOptions.clock
        }
      };
      loadGame(gameOptions);
      clock.set(inviteOptions.clock);
      guigameinfo.hidePlayerNames();
    }
    function startOnlineGame(gameOptions) {
      gui.setScreen("game online");
      onlinegame2.setColorAndGameID(gameOptions);
      gameOptions.variantOptions = generateVariantOptionsIfReloadingPrivateCustomGame();
      loadGame(gameOptions);
      onlinegame2.initOnlineGame(gameOptions);
      clock.set(gameOptions.clock, { timerWhite: gameOptions.timerWhite, timerBlack: gameOptions.timerBlack, timeNextPlayerLosesAt: gameOptions.timeNextPlayerLosesAt });
      guigameinfo.revealPlayerNames(gameOptions);
      drawoffers.set(gameOptions.drawOffer);
    }
    function generateVariantOptionsIfReloadingPrivateCustomGame() {
      if (!onlinegame2.getIsPrivate()) return;
      const gameID = onlinegame2.getGameID();
      if (!gameID) return console.error("Can't generate variant options when reloading private custom game because gameID isn't defined yet.");
      return localstorage2.loadItem(gameID);
    }
    function loadGame(gameOptions) {
      console.log("Loading game with game options:");
      console.log(gameOptions);
      main2.renderThisFrame();
      movement.eraseMomentum();
      options2.disableEM();
      gameOptions.metadata.UTCDate = gameOptions.metadata.UTCDate || math2.getCurrentUTCDate();
      gameOptions.metadata.UTCTime = gameOptions.metadata.UTCTime || math2.getCurrentUTCTime();
      const newGamefile = new gamefile(gameOptions.metadata, {
        // Pass in the pre-existing moves
        moves: gameOptions.moves,
        variantOptions: gameOptions.variantOptions,
        gameConclusion: gameOptions.gameConclusion
      });
      game2.loadGamefile(newGamefile);
      const centerArea = area.calculateFromUnpaddedBox(newGamefile.startSnapshot.box);
      movement.setPositionToArea(centerArea, "pidough");
      options2.setNavigationBar(true);
      sound.playSound_gamestart();
    }
    function lockCreateInviteButton() {
      createInviteButtonIsLocked = true;
      if (modeSelected !== "online") return;
      element_createInvite.disabled = true;
    }
    function unlockCreateInviteButton() {
      createInviteButtonIsLocked = false;
      element_createInvite.disabled = false;
    }
    function disableCreateInviteButton() {
      element_createInvite.disabled = true;
    }
    function enableCreateInviteButton() {
      element_createInvite.disabled = false;
    }
    function setElement_CreateInviteTextContent(text) {
      element_createInvite.textContent = text;
    }
    function isCreateInviteButtonLocked() {
      return createInviteButtonIsLocked;
    }
    function lockAcceptInviteButton() {
      acceptInviteButtonIsLocked = true;
    }
    function unlockAcceptInviteButton() {
      acceptInviteButtonIsLocked = false;
    }
    function isAcceptInviteButtonLocked() {
      return acceptInviteButtonIsLocked;
    }
    function onSocketClose() {
      unlockCreateInviteButton();
      unlockAcceptInviteButton();
    }
    function onPlayPage() {
      return gui.getScreen() === "title play";
    }
    return Object.freeze({
      isOpen,
      hideElement_joinPrivate,
      showElement_joinPrivate,
      hideElement_inviteCode,
      showElement_inviteCode,
      getModeSelected,
      open,
      close,
      startOnlineGame,
      setElement_CreateInviteTextContent,
      initListeners_Invites,
      closeListeners_Invites,
      onPlayPage,
      lockCreateInviteButton,
      unlockCreateInviteButton,
      isCreateInviteButtonLocked,
      lockAcceptInviteButton,
      unlockAcceptInviteButton,
      isAcceptInviteButtonLocked,
      onSocketClose
    });
  }();

  // src/client/scripts/game/gui/guititle.mjs
  var guititle = function() {
    const boardVel = 0.6;
    const titleElement = document.getElementById("title");
    const element_play = document.getElementById("play");
    const element_guide = document.getElementById("rules");
    const element_boardEditor = document.getElementById("board-editor");
    const element_menuExternalLinks = document.getElementById("menu-external-links");
    function open() {
      perspective2.disable();
      if (!gui.getScreen()?.includes("title")) movement.randomizePanVelDir();
      gui.setScreen("title");
      movement.setBoardScale(1.8, "pidough");
      style.revealElement(titleElement);
      style.revealElement(element_menuExternalLinks);
      initListeners();
    }
    function close() {
      closeListeners();
      style.hideElement(titleElement);
      style.hideElement(element_menuExternalLinks);
    }
    function initListeners() {
      element_play.addEventListener("click", callback_Play);
      element_guide.addEventListener("click", callback_Guide);
      element_boardEditor.addEventListener("click", gui.callback_featurePlanned);
    }
    function closeListeners() {
      element_play.removeEventListener("click", callback_Play);
      element_guide.removeEventListener("click", callback_Guide);
      element_boardEditor.removeEventListener("click", gui.callback_featurePlanned);
    }
    function callback_Play(event2) {
      event2 = event2 || window.event;
      close();
      guiplay.open();
    }
    function callback_Guide(event2) {
      event2 = event2 || window.event;
      close();
      guiguide.open();
    }
    return Object.freeze({
      boardVel,
      open,
      close
    });
  }();

  // src/client/scripts/game/rendering/highlightline.mjs
  var highlightline = function() {
    let modelLines;
    let modelGhost;
    const perspectiveLimitToTeleport = 50;
    const opacityOfGhostImage = 1;
    function genModel() {
      if (!movement.isScaleLess1Pixel_Virtual()) return;
      if (!selection2.isAPieceSelected()) return;
      const dataLines = [];
      const legalmoves2 = math2.deepCopyObject(selection2.getLegalMovesOfSelectedPiece());
      const pieceCoords = selection2.getPieceSelected().coords;
      const worldSpaceCoords = math2.convertCoordToWorldSpace(pieceCoords);
      const color = math2.deepCopyObject(options2.getLegalMoveHighlightColor());
      color[3] = 1;
      const snapDist = miniimage.gwidthWorld() / 2;
      const a = perspective2.distToRenderBoard;
      let boundingBox = perspective2.getEnabled() ? { left: -a, right: a, bottom: -a, top: a } : camera2.getScreenBoundingBox(false);
      const mouseLocation = input2.getMouseWorldLocation();
      let closestDistance;
      let closestPoint;
      for (const strline in legalmoves2.sliding) {
        const line2 = math2.getCoordsFromKey(strline);
        const diag2 = organizedlines2.getCFromLine(line2, worldSpaceCoords);
        const lineIsVertical2 = line2[0] === 0;
        const corner12 = math2.getAABBCornerOfLine(line2, true);
        let point12 = math2.getLineIntersectionEntryTile(line2[0], line2[1], diag2, boundingBox, corner12);
        if (!point12) continue;
        const leftLimitPointCoord2 = getPointOfDiagSlideLimit(pieceCoords, legalmoves2.sliding[strline], line2, false);
        const leftLimitPointWorld = math2.convertCoordToWorldSpace(leftLimitPointCoord2);
        point12 = capPointAtSlideLimit(point12, leftLimitPointWorld, false, lineIsVertical2);
        const corner22 = math2.getAABBCornerOfLine(line2, false);
        let point22 = math2.getLineIntersectionEntryTile(line2[0], line2[1], diag2, boundingBox, corner22);
        if (!point22) continue;
        const rightLimitPointCoord2 = getPointOfDiagSlideLimit(pieceCoords, legalmoves2.sliding[strline], line2, true);
        const rightLimitPointWorld = math2.convertCoordToWorldSpace(rightLimitPointCoord2);
        point22 = capPointAtSlideLimit(point22, rightLimitPointWorld, true, lineIsVertical2);
        appendLineToData(dataLines, point12, point22, color);
        const snapPoint = math2.closestPointOnLine(point12, point22, mouseLocation);
        if (!closestDistance) {
          if (snapPoint.distance > snapDist) continue;
        } else if (snapPoint.distance > closestDistance) {
          continue;
        }
        closestDistance = snapPoint.distance;
        snapPoint.moveset = legalmoves2.sliding[strline];
        snapPoint.line = line2;
        closestPoint = snapPoint;
      }
      ;
      modelLines = buffermodel.createModel_Colored(new Float32Array(dataLines), 2, "LINES");
      modelGhost = void 0;
      if (miniimage.isHovering()) return;
      if (!closestPoint) return;
      const dataGhost = [];
      const type = selection2.getPieceSelected().type;
      const rotation = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const { texStartX, texStartY, texEndX, texEndY } = bufferdata.getTexDataOfType(type, rotation);
      const halfWidth = miniimage.gwidthWorld() / 2;
      const startX = closestPoint.coords[0] - halfWidth;
      const startY = closestPoint.coords[1] - halfWidth;
      const endX = startX + miniimage.gwidthWorld();
      const endY = startY + miniimage.gwidthWorld();
      const { r, g, b } = options2.getColorOfType(type);
      const data = bufferdata.getDataQuad_ColorTexture(startX, startY, endX, endY, texStartX, texStartY, texEndX, texEndY, r, g, b, opacityOfGhostImage);
      dataGhost.push(...data);
      modelGhost = buffermodel.createModel_ColorTextured(new Float32Array(dataGhost), 2, "TRIANGLES", pieces.getSpritesheet());
      if (!input2.isMouseDown_Left() && !input2.getTouchClicked()) return;
      const moveset = closestPoint.moveset;
      let point1;
      let point2;
      boundingBox = perspective2.getEnabled() ? math2.generatePerspectiveBoundingBox(perspectiveLimitToTeleport) : board2.gboundingBox();
      const line = closestPoint.line;
      const diag = organizedlines2.getCFromLine(line, pieceCoords);
      const lineIsVertical = line[0] === 0;
      const corner1 = math2.getAABBCornerOfLine(line, true);
      point1 = math2.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner1);
      const leftLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, false);
      point1 = capPointAtSlideLimit(point1, leftLimitPointCoord, false, lineIsVertical);
      const corner2 = math2.getAABBCornerOfLine(line, false);
      point2 = math2.getLineIntersectionEntryTile(line[0], line[1], diag, boundingBox, corner2);
      const rightLimitPointCoord = getPointOfDiagSlideLimit(pieceCoords, moveset, line, true);
      point2 = capPointAtSlideLimit(point2, rightLimitPointCoord, true, lineIsVertical);
      let tileMouseFingerOver;
      if (input2.getTouchClicked()) {
        const tileMouseOver = board2.getTileMouseOver();
        tileMouseFingerOver = tileMouseOver.tile_Int;
      } else tileMouseFingerOver = board2.gtile_MouseOver_Int();
      const closestCoordCoords = math2.closestPointOnLine(point1, point2, tileMouseFingerOver).coords;
      const tel = { endCoords: closestCoordCoords, endScale: 1 };
      transition2.teleport(tel);
    }
    function appendLineToData(data, point1, point2, color) {
      const [r, g, b, a] = color;
      data.push(
        // Vertex               Color
        point1[0],
        point1[1],
        r,
        g,
        b,
        a,
        point2[0],
        point2[1],
        r,
        g,
        b,
        a
      );
    }
    function capPointAtSlideLimit(point, slideLimit, positive, lineIsVertical) {
      const cappingAxis = lineIsVertical ? 1 : 0;
      if (!positive && point[cappingAxis] < slideLimit[cappingAxis] || positive && point[cappingAxis] > slideLimit[cappingAxis]) return slideLimit;
      return point;
    }
    function getPointOfDiagSlideLimit(pieceCoords, moveset, line, positive) {
      const steps = positive ? moveset[1] : moveset[0];
      const yDiff = line[1] * steps;
      const xDiff = line[0] * steps;
      return [pieceCoords[0] + xDiff, pieceCoords[1] + yDiff];
    }
    function render() {
      if (!movement.isScaleLess1Pixel_Virtual()) return;
      if (!selection2.isAPieceSelected()) return;
      if (!modelLines) {
        console.log("No highlightline model to render!");
        return;
      }
      modelLines.render();
      if (modelGhost) modelGhost.render();
    }
    return Object.freeze({
      genModel,
      render
    });
  }();

  // src/client/scripts/game/chess/backcompatible.mjs
  var backcompatible = function() {
    function getLongformatInNewNotation(longformat) {
      if (!isLongformatInOldNotation(longformat)) return longformat;
      const converted = {};
      const { pawnDoublePush, castleWith } = longformat.gameRules ? longformat.gameRules : {};
      converted.metadata = {};
      if (longformat.variant) converted.metadata.Variant = longformat.variant;
      converted.fullMove = 1;
      if (longformat.startingPosition) {
        converted.startingPosition = longformat.startingPosition;
        converted.specialRights = formatconverter2.generateSpecialRights(longformat.startingPosition, pawnDoublePush, castleWith);
      }
      if (longformat.moves?.length > 0) {
        const results = {};
        const moveslong = movesscript2.convertMovesTo1DFormat(longformat.moves, results);
        const turnOrderArray = results.turn === "black" ? ["b", "w"] : ["w", "b"];
        const options3 = {
          turnOrderArray,
          fullmove: converted.fullMove,
          make_new_lines: false,
          compact_moves: 2
        };
        const shortmoves = formatconverter2.longToShortMoves(moveslong, options3);
        const shortmovessplit = shortmoves.split("|");
        converted.moves = shortmovessplit;
      }
      if (longformat.promotionRanks) {
        if (!longformat.gameRules) longformat.gameRules = { promotionRanks: longformat.promotionRanks };
        else longformat.gameRules.promotionRanks = longformat.promotionRanks;
      }
      if (longformat.gameRules) {
        const newGameRules = {};
        if (longformat.gameRules.slideLimit && longformat.gameRules.slideLimit !== "Infinity") newGameRules.slideLimit = longformat.gameRules.slideLimit;
        if (longformat.gameRules.winConditions) {
          const newWinConditions = { white: [], black: [] };
          for (const condition in longformat.gameRules.winConditions) {
            const value = longformat.gameRules.winConditions[condition];
            if (value === "both" || value === "white") newWinConditions.white.push(condition);
            if (value === "both" || value === "black") newWinConditions.black.push(condition);
          }
          newGameRules.winConditions = newWinConditions;
        }
        if (longformat.promotionRanks) {
          newGameRules.promotionRanks = [longformat.promotionRanks[1], longformat.promotionRanks[0]];
          newGameRules.promotionsAllowed = variant.getPromotionsAllowed(longformat.startingPosition, newGameRules.promotionRanks);
        }
        converted.gameRules = newGameRules;
      }
      console.log("longformat after converting to new format:");
      console.log(math.deepCopyObject(converted));
      return converted;
    }
    function isLongformatInOldNotation(longformat) {
      return longformat.variant || longformat.promotionRanks || longformat.moves && movesscript2.areMovesIn2DFormat(longformat.moves);
    }
    function isDateMetadataInOldFormat(Date2) {
      if (!Date2) return false;
      return Date2.indexOf(" ") !== -1;
    }
    function convertDateMetdatatoUTCDateUTCTime(DateMetadata) {
      const dateTime = new Date(DateMetadata);
      const year = String(dateTime.getUTCFullYear());
      const month = String(dateTime.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dateTime.getUTCDate()).padStart(2, "0");
      const hours = String(dateTime.getUTCHours()).padStart(2, "0");
      const minutes = String(dateTime.getUTCMinutes()).padStart(2, "0");
      const seconds = String(dateTime.getUTCSeconds()).padStart(2, "0");
      const UTCDate = `${year}.${month}.${day}`;
      const UTCTime = `${hours}:${minutes}:${seconds}`;
      return { UTCDate, UTCTime };
    }
    function convertClockToTimeControl(Clock) {
      if (!Clock) return void 0;
      if (Clock === "Infinite") return "-";
      const [minutes, incrementSecs] = Clock.split("+");
      const seconds = minutes * 60;
      return `${seconds}+${incrementSecs}`;
    }
    return Object.freeze({
      getLongformatInNewNotation,
      isDateMetadataInOldFormat,
      convertDateMetdatatoUTCDateUTCTime,
      convertClockToTimeControl
    });
  }();

  // src/client/scripts/game/chess/copypastegame.mjs
  var copypastegame2 = function() {
    const copySinglePosition = false;
    const retainMetadataWhenPasting = ["White", "Black", "TimeControl", "Event", "Site", "Round"];
    function callbackCopy(event2) {
      const gamefile2 = game2.getGamefile();
      const Variant = gamefile2.metadata.Variant;
      const primedGamefile = primeGamefileForCopying(gamefile2);
      const largeGame = Variant === "Omega_Squared" || Variant === "Omega_Cubed" || Variant === "Omega_Fourth";
      const specifyPosition = !largeGame;
      const shortformat = formatconverter2.LongToShort_Format(primedGamefile, { compact_moves: 1, make_new_lines: false, specifyPosition });
      main2.copyToClipboard(shortformat);
      statustext2.showStatus(translations.copypaste.copied_game);
    }
    function primeGamefileForCopying(gamefile2) {
      let primedGamefile = {};
      const gameRulesCopy = math2.deepCopyObject(gamefile2.gameRules);
      primedGamefile.metadata = gamefile2.metadata;
      primedGamefile.metadata.Variant = translations[primedGamefile.metadata.Variant] || primedGamefile.metadata.Variant;
      primedGamefile.enpassant = gamefile2.startSnapshot.enpassant;
      if (gameRulesCopy.moveRule) primedGamefile.moveRule = `${gamefile2.startSnapshot.moveRuleState}/${gameRulesCopy.moveRule}`;
      delete gameRulesCopy.moveRule;
      primedGamefile.fullMove = gamefile2.startSnapshot.fullMove;
      primedGamefile.startingPosition = gamefile2.startSnapshot.positionString;
      primedGamefile.moves = gamefile2.moves;
      primedGamefile.gameRules = gameRulesCopy;
      if (copySinglePosition) {
        primedGamefile.startingPosition = gamefile2.startSnapshot.position;
        primedGamefile.specialRights = gamefile2.startSnapshot.specialRights;
        primedGamefile = formatconverter2.GameToPosition(primedGamefile, Infinity);
      }
      return primedGamefile;
    }
    async function callbackPaste(event2) {
      if (onlinegame2.areInOnlineGame() && !onlinegame2.getIsPrivate()) return statustext2.showStatus(translations.copypaste.cannot_paste_in_public);
      if (onlinegame2.areInOnlineGame() && onlinegame2.getIsPrivate() && game2.getGamefile().moves.length > 0) return statustext2.showStatus(translations.copypaste.cannot_paste_after_moves);
      let clipboard;
      try {
        clipboard = await navigator.clipboard.readText();
      } catch (error) {
        const message = translations.copypaste.clipboard_denied;
        return statustext2.showStatus(message + "\n" + error, true);
      }
      let longformat;
      try {
        longformat = JSON.parse(clipboard);
      } catch (error) {
        try {
          longformat = formatconverter2.ShortToLong_Format(clipboard, true, true);
        } catch (e) {
          console.error(e);
          statustext2.showStatus(translations.copypaste.clipboard_invalid, true);
          return;
        }
      }
      longformat = backcompatible.getLongformatInNewNotation(longformat);
      if (!verifyLongformat(longformat)) return;
      console.log(longformat);
      pasteGame(longformat);
    }
    function verifyLongformat(longformat) {
      if (!longformat.metadata) longformat.metadata = {};
      if (!longformat.fullMove) longformat.fullMove = 1;
      if (!longformat.startingPosition && !longformat.metadata.Variant) {
        statustext2.showStatus(translations.copypaste.game_needs_to_specify, true);
        return false;
      }
      if (longformat.startingPosition && !longformat.specialRights) longformat.specialRights = {};
      if (!longformat.gameRules) longformat.gameRules = variant.getBareMinimumGameRules();
      longformat.gameRules.winConditions = longformat.gameRules.winConditions || variant.getDefaultWinConditions();
      if (!verifyWinConditions(longformat.gameRules.winConditions)) return false;
      longformat.gameRules.promotionRanks = longformat.gameRules.promotionRanks || null;
      longformat.gameRules.promotionsAllowed = longformat.gameRules.promotionsAllowed || { white: [], black: [] };
      longformat.gameRules.turnOrder = longformat.gameRules.turnOrder || ["white", "black"];
      return true;
    }
    function verifyWinConditions(winConditions) {
      for (let i = 0; i < winConditions.white.length; i++) {
        const winCondition = winConditions.white[i];
        if (wincondition.validWinConditions.includes(winCondition)) continue;
        statustext2.showStatus(`${translations.copypaste.invalid_wincon_white} "${winCondition}".`, true);
        return false;
      }
      for (let i = 0; i < winConditions.black.length; i++) {
        const winCondition = winConditions.black[i];
        if (wincondition.validWinConditions.includes(winCondition)) continue;
        statustext2.showStatus(`${translations.copypaste.invalid_wincon_black} "${winCondition}".`, true);
        return false;
      }
      return true;
    }
    function pasteGame(longformat) {
      console.log(translations.copypaste.pasting_game);
      if (!verifyGamerules(longformat.gameRules)) return;
      const currentGameMetadata = game2.getGamefile().metadata;
      retainMetadataWhenPasting.forEach((metadataName) => {
        longformat.metadata[metadataName] = currentGameMetadata[metadataName];
      });
      if (longformat.shortposition || longformat.startingPosition) {
        longformat.metadata.UTCDate = currentGameMetadata.UTCDate;
        longformat.metadata.UTCTime = currentGameMetadata.UTCTime;
      } else if (backcompatible.isDateMetadataInOldFormat(longformat.metadata.Date)) {
        const { UTCDate, UTCTime } = backcompatible.convertDateMetdatatoUTCDateUTCTime(longformat.metadata.Date);
        longformat.metadata.UTCDate = UTCDate;
        longformat.metadata.UTCTime = UTCTime;
      }
      longformat.metadata.Variant = convertVariantFromSpokenLanguageToCode(longformat.metadata.Variant) || longformat.metadata.Variant;
      delete longformat.metadata.Clock;
      delete longformat.metadata.Result;
      delete longformat.metadata.Condition;
      delete longformat.metadata.Termination;
      const variantOptions = {
        fullMove: longformat.fullMove,
        enpassant: longformat.enpassant,
        moveRule: longformat.moveRule,
        positionString: longformat.shortposition,
        startingPosition: longformat.startingPosition,
        specialRights: longformat.specialRights,
        gameRules: longformat.gameRules
      };
      if (onlinegame2.areInOnlineGame() && onlinegame2.getIsPrivate()) {
        const gameID = onlinegame2.getGameID();
        localstorage2.saveItem(gameID, variantOptions);
      }
      const newGamefile = new gamefile(longformat.metadata, { moves: longformat.moves, variantOptions });
      const privateMatchWarning = onlinegame2.getIsPrivate() ? ` ${translations.copypaste.pasting_in_private}` : "";
      let tooManyPieces = false;
      if (newGamefile.startSnapshot.pieceCount >= gamefileutility.pieceCountToDisableCheckmate) {
        tooManyPieces = true;
        statustext2.showStatus(`${translations.copypaste.piece_count} ${newGamefile.startSnapshot.pieceCount} ${translations.copypaste.exceeded} ${gamefileutility.pieceCountToDisableCheckmate}! ${translations.copypaste.changed_wincon}${privateMatchWarning}`, false, 1.5);
        const whiteHasCheckmate = newGamefile.gameRules.winConditions.white.includes("checkmate");
        const blackHasCheckmate = newGamefile.gameRules.winConditions.black.includes("checkmate");
        if (whiteHasCheckmate) {
          math2.removeObjectFromArray(newGamefile.gameRules.winConditions.white, "checkmate", true);
          newGamefile.gameRules.winConditions.white.push("royalcapture");
        }
        if (blackHasCheckmate) {
          math2.removeObjectFromArray(newGamefile.gameRules.winConditions.black, "checkmate", true);
          newGamefile.gameRules.winConditions.black.push("royalcapture");
        }
      }
      if (!tooManyPieces) {
        const message = `${translations.copypaste.loaded_from_clipboard}${privateMatchWarning}`;
        statustext2.showStatus(message);
      }
      game2.unloadGame();
      game2.loadGamefile(newGamefile);
      console.log(translations.copypaste.loaded);
    }
    function convertVariantFromSpokenLanguageToCode(Variant) {
      for (const translationCode in translations) {
        if (translations[translationCode] === Variant) {
          return translationCode;
        }
      }
    }
    function verifyGamerules(gameRules) {
      if (gameRules.slideLimit !== void 0 && typeof gameRules.slideLimit !== "number") {
        statustext2.showStatus(`${translations.copypaste.slidelimit_not_number} "${gameRules.slideLimit}"`, true);
        return false;
      }
      return true;
    }
    return Object.freeze({
      callbackCopy,
      callbackPaste
    });
  }();

  // src/client/scripts/game/rendering/promotionlines.mjs
  var promotionlines = {
    startEnd: [-3, 12],
    thickness: 0.01,
    render: function() {
      if (!game2.getGamefile().gameRules.promotionRanks) return;
      const model = promotionlines.initModel();
      const boardPos = movement.getBoardPos();
      const position = [
        -boardPos[0],
        // Add the model's offset
        -boardPos[1],
        0
      ];
      const boardScale = movement.getBoardScale();
      const scale = [boardScale, boardScale, 1];
      model.render(position, scale);
    },
    /**
     * Generates the buffer model of the promotion lines
     * 
     * TODO: Make the lines more clear as to what side they belong to and what
     * square you need to reach. Perhaps a color gradient? Perhaps it glows
     * brighter when you have a pawn selected?
     * 
     * This also needs to be centered with the pieces.
     * @returns {BufferModel} The buffer model
     */
    initModel: function() {
      const startX = promotionlines.startEnd[0] - board2.gsquareCenter();
      const endX = promotionlines.startEnd[1] + 1 - board2.gsquareCenter();
      const gamefile2 = game2.getGamefile();
      const yLow1 = gamefile2.gameRules.promotionRanks[0] + 1 - board2.gsquareCenter() - promotionlines.thickness;
      const yHigh1 = gamefile2.gameRules.promotionRanks[0] + 1 - board2.gsquareCenter() + promotionlines.thickness;
      const yLow2 = gamefile2.gameRules.promotionRanks[1] - board2.gsquareCenter() - promotionlines.thickness;
      const yHigh2 = gamefile2.gameRules.promotionRanks[1] - board2.gsquareCenter() + promotionlines.thickness;
      const data = new Float32Array([
        // x      y             r g b a
        startX,
        yLow1,
        0,
        0,
        0,
        1,
        startX,
        yHigh1,
        0,
        0,
        0,
        1,
        endX,
        yLow1,
        0,
        0,
        0,
        1,
        endX,
        yLow1,
        0,
        0,
        0,
        1,
        startX,
        yHigh1,
        0,
        0,
        0,
        1,
        endX,
        yHigh1,
        0,
        0,
        0,
        1,
        startX,
        yLow2,
        0,
        0,
        0,
        1,
        startX,
        yHigh2,
        0,
        0,
        0,
        1,
        endX,
        yLow2,
        0,
        0,
        0,
        1,
        endX,
        yLow2,
        0,
        0,
        0,
        1,
        startX,
        yHigh2,
        0,
        0,
        0,
        1,
        endX,
        yHigh2,
        0,
        0,
        0,
        1
      ]);
      return buffermodel.createModel_Colored(data, 2, "TRIANGLES");
    }
  };

  // src/client/scripts/game/chess/game.mjs
  var game2 = function() {
    let gamefile2;
    function getGamefile() {
      return gamefile2;
    }
    function areInGame() {
      return gamefile2 != null;
    }
    function init() {
      initTextures();
      guititle.open();
      board2.recalcTileWidth_Pixels();
    }
    function initTextures() {
      board2.initTextures();
      pieces.initSpritesheet();
      pieces.initSpritesheetData();
    }
    function updateVariablesAfterScreenResize() {
      board2.initDarkTilesModel();
      movement.setScale_When1TileIs1Pixel_Physical(camera2.getScreenBoundingBox(false).right * 2 / camera2.canvas.width);
      movement.setScale_When1TileIs1Pixel_Virtual(movement.getScale_When1TileIs1Pixel_Physical() * camera2.getPixelDensity());
    }
    function update() {
      if (input2.isKeyDown("`")) options2.toggleDeveloperMode();
      if (input2.isKeyDown("m")) options2.toggleFPS();
      if (game2.getGamefile()?.mesh.locked && input2.isKeyDown("z")) main2.sforceCalc(true);
      if (gui.getScreen().includes("title")) updateTitleScreen();
      else updateBoard();
      onlinegame2.update();
      guinavigation.updateElement_Coords();
    }
    function updateTitleScreen() {
      movement.panBoard();
      invites.update();
    }
    function updateBoard() {
      if (input2.isKeyDown("1")) options2.toggleEM();
      if (input2.isKeyDown("escape")) guipause2.toggle();
      if (input2.isKeyDown("tab")) guipause2.callback_TogglePointers();
      if (input2.isKeyDown("r")) piecesmodel.regenModel(game2.getGamefile(), options2.getPieceRegenColorArgs(), true);
      if (input2.isKeyDown("n")) options2.toggleNavigationBar();
      clock.update();
      miniimage.testIfToggled();
      animation.update();
      if (guipause2.areWePaused() && !onlinegame2.areInOnlineGame()) return;
      movement.recalcPosition();
      transition2.update();
      board2.recalcVariables();
      movesscript2.update();
      arrows.update();
      selection2.update();
      miniimage.genModel();
      highlightline.genModel();
      movement.updateNavControls();
      if (guipause2.areWePaused()) return;
      movement.dragBoard();
    }
    function render() {
      board2.render();
      renderEverythingInGame();
    }
    function renderEverythingInGame() {
      if (gui.getScreen().includes("title")) return;
      input2.renderMouse();
      webgl.executeWithDepthFunc_ALWAYS(() => {
        highlights.render();
        highlightline.render();
      });
      animation.renderTransparentSquares();
      pieces.renderPiecesInGame(gamefile2);
      animation.renderPieces();
      webgl.executeWithDepthFunc_ALWAYS(() => {
        promotionlines.render();
        selection2.renderGhostPiece();
        arrows.renderThem();
        perspective2.renderCrosshair();
      });
    }
    function loadGamefile(newGamefile) {
      if (gamefile2) return console.error("Must unloadGame() before loading a new one!");
      gamefile2 = newGamefile;
      if (newGamefile.startSnapshot.pieceCount >= gamefileutility2.pieceCountToDisableCheckmate) {
        miniimage.disable();
        arrows.setMode(0);
      } else miniimage.enable();
      if (!wincondition2.isCheckmateCompatibleWithGame(gamefile2)) wincondition2.swapCheckmateForRoyalCapture(gamefile2);
      guipromotion.initUI(gamefile2.gameRules.promotionsAllowed);
      piecesmodel.regenModel(game2.getGamefile(), options2.getPieceRegenColorArgs());
      main2.enableForceRender();
      guinavigation.update_MoveButtons();
      guigameinfo.updateWhosTurn(gamefile2);
      if (gamefileutility2.isGameOver(gamefile2)) gamefileutility2.concludeGame(gamefile2, gamefile2.gameConclusion);
      initListeners();
    }
    function unloadGame() {
      gamefile2.mesh.terminateIfGenerating();
      gamefile2 = void 0;
      selection2.unselectPiece();
      transition2.eraseTelHist();
      board2.updateTheme();
      closeListeners();
    }
    function initListeners() {
      document.addEventListener("copy", copypastegame2.callbackCopy);
      document.addEventListener("paste", copypastegame2.callbackPaste);
    }
    function closeListeners() {
      document.removeEventListener("copy", copypastegame2.callbackCopy);
      document.removeEventListener("paste", copypastegame2.callbackPaste);
    }
    return Object.freeze({
      getGamefile,
      areInGame,
      init,
      updateVariablesAfterScreenResize,
      update,
      render,
      loadGamefile,
      unloadGame
    });
  }();

  // src/client/scripts/game/misc/clock.mjs
  var clock = function() {
    const element_timerWhite = document.getElementById("timer-white");
    const element_timerBlack = document.getElementById("timer-black");
    const element_timerContainerWhite = document.getElementById("timer-container-white");
    const element_timerContainerBlack = document.getElementById("timer-container-black");
    let untimed;
    const startTime = {
      /** The number of minutes both sides started with. */
      minutes: void 0,
      /** The number of miliseconds both sides started with. */
      millis: void 0,
      /** The increment used, in milliseconds. */
      increment: void 0
    };
    const currentTime = {
      white: void 0,
      black: void 0
    };
    let colorTicking;
    let timeRemainAtTurnStart;
    let timeAtTurnStart;
    let timeNextPlayerLosesAt;
    const lowtimeNotif = {
      /** True if white's clock has reached 1 minute or less and the ticking sound effect has been played. */
      whiteNotified: false,
      /** True if black's clock has reached 1 minute or less and the ticking sound effect has been played. */
      blackNotified: false,
      /** The timer that, when ends, will play the lowtime ticking audio cue. */
      timeoutID: void 0,
      /** The amount of milliseconds before losing on time at which the lowtime tick notification will be played. */
      timeToStartFromEnd: 65615,
      /** The minimum start time required to give a lowtime notification at 1 minute remaining. */
      clockMinsRequiredToUse: 2
    };
    const countdown = {
      drum: {
        timeoutID: void 0
      },
      tick: {
        /**
         * The current sound object, if specified, that is playing our tick sound effects right before the 10s countdown.
         * This can be used to stop the sound from playing.
         */
        sound: void 0,
        timeoutID: void 0,
        timeToStartFromEnd: 15625,
        fadeInDuration: 300,
        fadeOutDuration: 100
      },
      ticking: {
        /**
         * The current sound object, if specified, that is playing our ticking sound effects during the 10s countdown.
         * This can be used to stop the sound from playing.
         */
        sound: void 0,
        timeoutID: void 0,
        timeToStartFromEnd: 10380,
        fadeInDuration: 300,
        fadeOutDuration: 100
      }
    };
    function set(clock2, currentTimes) {
      const gamefile2 = game2.getGamefile();
      if (!gamefile2) return console.error("Game must be initialized before starting the clocks.");
      startTime.minutes = null;
      startTime.millis = null;
      startTime.increment = null;
      const clockPartsSplit = getMinutesAndIncrementFromClock(clock2);
      if (clockPartsSplit !== null) {
        startTime.minutes = clockPartsSplit.minutes;
        startTime.millis = math2.minutesToMillis(startTime.minutes);
        startTime.increment = clockPartsSplit.increment;
      }
      untimed = isClockValueInfinite(clock2);
      if (untimed) return hideClocks();
      else showClocks();
      if (currentTimes) edit(currentTimes.timerWhite, currentTimes.timerBlack, currentTimes.timeNextPlayerLosesAt);
      else {
        currentTime.white = startTime.millis;
        currentTime.black = startTime.millis;
      }
      updateTextContent();
    }
    function hideClocks() {
      style.hideElement(element_timerContainerWhite);
      style.hideElement(element_timerContainerBlack);
    }
    function showClocks() {
      style.revealElement(element_timerContainerWhite);
      style.revealElement(element_timerContainerBlack);
    }
    function edit(newTimeWhite, newTimeBlack, timeNextPlayerLoses) {
      const gamefile2 = game2.getGamefile();
      colorTicking = gamefile2.whosTurn;
      currentTime.white = newTimeWhite;
      currentTime.black = newTimeBlack;
      timeNextPlayerLosesAt = timeNextPlayerLoses;
      const now = Date.now();
      timeAtTurnStart = now;
      if (timeNextPlayerLoses) {
        const nextPlayerTrueTime = timeNextPlayerLoses - now;
        currentTime[colorTicking] = nextPlayerTrueTime;
      }
      timeRemainAtTurnStart = colorTicking === "white" ? currentTime.white : currentTime.black;
      updateTextContent();
      if (colorTicking === "white") removeBorder(element_timerBlack);
      else removeBorder(element_timerWhite);
      if (!movesscript2.isGameResignable(gamefile2) || gamefile2.gameConclusion) return;
      rescheduleMinuteTick();
      rescheduleCountdown();
    }
    function push() {
      if (onlinegame2.areInOnlineGame()) return;
      if (untimed) return;
      const gamefile2 = game2.getGamefile();
      if (!movesscript2.isGameResignable(gamefile2)) return;
      currentTime[colorTicking] += math2.secondsToMillis(startTime.increment);
      colorTicking = gamefile2.whosTurn;
      timeRemainAtTurnStart = currentTime[colorTicking];
      timeAtTurnStart = Date.now();
      timeNextPlayerLosesAt = timeAtTurnStart + timeRemainAtTurnStart;
      rescheduleMinuteTick();
      rescheduleCountdown();
      if (colorTicking === "white") removeBorder(element_timerBlack);
      else removeBorder(element_timerWhite);
    }
    function stop() {
      timeRemainAtTurnStart = void 0;
      timeAtTurnStart = void 0;
      timeNextPlayerLosesAt = void 0;
      colorTicking = void 0;
      clearTimeout(lowtimeNotif.timeoutID);
      clearTimeout(countdown.ticking.timeoutID);
      clearTimeout(countdown.tick.timeoutID);
      clearTimeout(countdown.drum.timeoutID);
      countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
      countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
    }
    function reset() {
      stop();
      untimed = void 0;
      startTime.minutes = void 0;
      startTime.millis = void 0;
      startTime.increment = void 0;
      currentTime.white = void 0;
      currentTime.black = void 0;
      lowtimeNotif.whiteNotified = false;
      lowtimeNotif.blackNotified = false;
      countdown.drum.timeoutID = void 0;
      countdown.tick.sound = void 0;
      countdown.ticking.sound = void 0;
      countdown.tick.timeoutID = void 0;
      countdown.ticking.timeoutID = void 0;
      removeBorder(element_timerWhite);
      removeBorder(element_timerBlack);
    }
    function removeBorder(element) {
      element.style.outline = "";
    }
    function update() {
      const gamefile2 = game2.getGamefile();
      if (untimed || gamefile2.gameConclusion || !movesscript2.isGameResignable(gamefile2) || timeAtTurnStart == null) return;
      if (colorTicking === "white") updateBorderColor(element_timerWhite, currentTime.white);
      else updateBorderColor(element_timerBlack, currentTime.black);
      const timePassedSinceTurnStart = Date.now() - timeAtTurnStart;
      if (colorTicking === "white") currentTime.white = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);
      else currentTime.black = Math.ceil(timeRemainAtTurnStart - timePassedSinceTurnStart);
      updateTextContent();
      if (onlinegame2.areInOnlineGame()) return;
      if (currentTime.white <= 0) {
        gamefile2.gameConclusion = "black time";
        gamefileutility.concludeGame(game2.getGamefile());
      } else if (currentTime.black <= 0) {
        gamefile2.gameConclusion = "white time";
        gamefileutility.concludeGame(game2.getGamefile());
      }
    }
    function updateBorderColor(element, currentTimeRemain) {
      const percRemain = currentTimeRemain / (startTime.minutes * 60 * 1e3);
      const perc = 1 - percRemain;
      let r = 0, g = 0, b = 0;
      if (percRemain > 1 + 1 / 3) {
        g = 1;
        b = 1;
      } else if (percRemain > 1) {
        const localPerc = (percRemain - 1) * 3;
        g = 1;
        b = localPerc;
      } else if (perc < 0.5) {
        const localPerc = perc * 2;
        r = localPerc;
        g = 1;
      } else if (perc < 0.75) {
        const localPerc = (perc - 0.5) * 4;
        r = 1;
        g = 1 - localPerc * 0.5;
      } else {
        const localPerc = (perc - 0.75) * 4;
        r = 1;
        g = 0.5 - localPerc * 0.5;
      }
      element.style.outline = `3px solid rgb(${r * 255},${g * 255},${b * 255})`;
    }
    function updateTextContent() {
      const whiteText = getTextContentFromTimeRemain(currentTime.white);
      const blackText = getTextContentFromTimeRemain(currentTime.black);
      element_timerWhite.textContent = whiteText;
      element_timerBlack.textContent = blackText;
    }
    function getTextContentFromTimeRemain(time) {
      let seconds = Math.ceil(time / 1e3);
      let minutes = 0;
      while (seconds >= 60) {
        seconds -= 60;
        minutes++;
      }
      if (seconds < 0) seconds = 0;
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
    function getClockFromKey(key) {
      const minutesAndIncrement = getMinutesAndIncrementFromClock(key);
      if (minutesAndIncrement === null) return translations["no_clock"];
      return `${minutesAndIncrement.minutes}m+${minutesAndIncrement.increment}s`;
    }
    function getMinutesAndIncrementFromClock(clock2) {
      if (isClockValueInfinite(clock2)) return null;
      const [seconds, increment] = clock2.split("+").map((part) => +part);
      const minutes = seconds / 60;
      return { minutes, increment };
    }
    function isClockValueInfinite(clock2) {
      return clock2 === "-";
    }
    function printClocks() {
      console.log(`White time: ${currentTime.white}`);
      console.log(`Black time: ${currentTime.black}`);
      console.log(`timeRemainAtTurnStart: ${timeRemainAtTurnStart}`);
      console.log(`timeAtTurnStart: ${timeAtTurnStart}`);
    }
    function rescheduleMinuteTick() {
      if (startTime.minutes < lowtimeNotif.clockMinsRequiredToUse) return;
      clearTimeout(lowtimeNotif.timeoutID);
      if (onlinegame2.areInOnlineGame() && colorTicking !== onlinegame2.getOurColor()) return;
      if (colorTicking === "white" && lowtimeNotif.whiteNotified || colorTicking === "black" && lowtimeNotif.blackNotified) return;
      const timeRemain = timeRemainAtTurnStart - lowtimeNotif.timeToStartFromEnd;
      lowtimeNotif.timeoutID = setTimeout(playMinuteTick, timeRemain);
    }
    function playMinuteTick() {
      sound.playSound_tick({ volume: 0.07 });
      if (colorTicking === "white") lowtimeNotif.whiteNotified = true;
      else if (colorTicking === "black") lowtimeNotif.blackNotified = true;
      else console.error("Cannot set white/lowtimeNotif.blackNotified when colorTicking is undefined");
    }
    function rescheduleCountdown() {
      const now = Date.now();
      rescheduleDrum(now);
      rescheduleTicking(now);
      rescheduleTick(now);
    }
    function rescheduleDrum(now) {
      clearTimeout(countdown.drum.timeoutID);
      if (onlinegame2.areInOnlineGame() && colorTicking !== onlinegame2.getOurColor() || !timeNextPlayerLosesAt) return;
      const timeUntil10SecsRemain = timeNextPlayerLosesAt - now - 1e4;
      let timeNextDrum = timeUntil10SecsRemain;
      let secsRemaining = 10;
      if (timeNextDrum < 0) {
        const addTimeNextDrum = -Math.floor(timeNextDrum / 1e3) * 1e3;
        timeNextDrum += addTimeNextDrum;
        secsRemaining -= addTimeNextDrum / 1e3;
      }
      countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeNextDrum, secsRemaining);
    }
    function rescheduleTicking(now) {
      clearTimeout(countdown.ticking.timeoutID);
      countdown.ticking.sound?.fadeOut(countdown.ticking.fadeOutDuration);
      if (onlinegame2.areInOnlineGame() && colorTicking !== onlinegame2.getOurColor() || !timeNextPlayerLosesAt) return;
      if (timeAtTurnStart < 1e4) return;
      const timeToStartTicking = timeNextPlayerLosesAt - countdown.ticking.timeToStartFromEnd;
      const timeRemain = timeToStartTicking - now;
      if (timeRemain > 0) countdown.ticking.timeoutID = setTimeout(playTickingEffect, timeRemain);
      else {
        const offset = -timeRemain;
        playTickingEffect(offset);
      }
    }
    function rescheduleTick(now) {
      clearTimeout(countdown.tick.timeoutID);
      countdown.tick.sound?.fadeOut(countdown.tick.fadeOutDuration);
      if (onlinegame2.areInOnlineGame() && colorTicking !== onlinegame2.getOurColor() || !timeNextPlayerLosesAt) return;
      const timeToStartTick = timeNextPlayerLosesAt - countdown.tick.timeToStartFromEnd;
      const timeRemain = timeToStartTick - now;
      if (timeRemain > 0) countdown.tick.timeoutID = setTimeout(playTickEffect, timeRemain);
      else {
        const offset = -timeRemain;
        playTickEffect(offset);
      }
    }
    function playDrumAndQueueNext(secsRemaining) {
      if (!secsRemaining) return console.error("Cannot play drum without secsRemaining");
      sound.playSound_drum();
      const timeRemain = timeNextPlayerLosesAt - Date.now();
      if (timeRemain < 1500) return;
      const newSecsRemaining = secsRemaining - 1;
      if (newSecsRemaining === 0) return;
      const timeUntilNextDrum = timeNextPlayerLosesAt - Date.now() - newSecsRemaining * 1e3;
      countdown.drum.timeoutID = setTimeout(playDrumAndQueueNext, timeUntilNextDrum, newSecsRemaining);
    }
    function playTickingEffect(offset) {
      countdown.ticking.sound = sound.playSound_ticking({ fadeInDuration: countdown.ticking.fadeInDuration, offset });
    }
    function playTickEffect(offset) {
      countdown.tick.sound = sound.playSound_tick({ volume: 0.07, fadeInDuration: countdown.tick.fadeInDuration, offset });
    }
    function isGameUntimed() {
      return untimed;
    }
    return Object.freeze({
      set,
      edit,
      stop,
      reset,
      update,
      push,
      getClockFromKey,
      isClockValueInfinite,
      printClocks,
      isGameUntimed,
      hideClocks,
      showClocks
    });
  }();

  // src/client/scripts/game/misc/invites.mjs
  var invites = function() {
    const invitesContainer = document.getElementById("invites");
    const ourInviteContainer = document.getElementById("our-invite");
    let activeInvites;
    let weHaveInvite = false;
    let ourInviteID;
    const element_joinExisting = document.getElementById("join-existing");
    const element_inviteCodeCode = document.getElementById("invite-code-code");
    function gelement_iCodeCode() {
      return element_inviteCodeCode;
    }
    function update() {
      if (!guiplay.onPlayPage()) return;
      if (loadbalancer2.gisHibernating()) statustext2.showStatus(translations["invites"]["move_mouse"], false, 0.1);
    }
    function unsubIfWeNotHave() {
      if (!weHaveInvite) websocket.unsubFromInvites();
    }
    function onmessage(data) {
      if (!guiplay.isOpen()) return;
      switch (data.action) {
        case "inviteslist":
          updateInviteList(data.value.invitesList);
          updateActiveGameCount(data.value.currentGameCount);
          break;
        case "gamecount":
          updateActiveGameCount(data.value);
          break;
        default:
          statustext2.showStatus(`${translations["invites"]["unknown_action_received_1"]} ${data.action} ${translations["invites"]["unknown_action_received_2"]}`, true);
          break;
      }
    }
    function create(inviteOptions) {
      if (weHaveInvite) return console.error("We already have an existing invite, can't create more.");
      generateTagForInvite(inviteOptions);
      guiplay.lockCreateInviteButton();
      const onreplyFunc = guiplay.unlockCreateInviteButton;
      websocket.sendmessage("invites", "createinvite", inviteOptions, true, onreplyFunc);
    }
    function cancel(id = ourInviteID) {
      if (!weHaveInvite) return;
      if (!id) return statustext2.showStatus(translations["invites"]["cannot_cancel"], true);
      deleteInviteTagInLocalStorage();
      guiplay.lockCreateInviteButton();
      const onreplyFunc = guiplay.unlockCreateInviteButton;
      websocket.sendmessage("invites", "cancelinvite", id, true, onreplyFunc);
    }
    function generateTagForInvite(inviteOptions) {
      const tag = math2.generateID(8);
      localstorage2.saveItem("invite-tag", tag);
      inviteOptions.tag = tag;
    }
    function deleteInviteTagInLocalStorage() {
      localstorage2.deleteItem("invite-tag");
    }
    function updateInviteList(list) {
      if (!list) return;
      activeInvites = list;
      const alreadySeenOurInvite = weHaveInvite;
      let alreadyPlayedSound = false;
      clear();
      let foundOurs = false;
      let privateInviteID = void 0;
      ourInviteID = void 0;
      for (let i = 0; i < list.length; i++) {
        const invite = list[i];
        const ours = foundOurs ? false : isInviteOurs(invite);
        if (ours) {
          foundOurs = true;
          ourInviteID = invite.id;
          if (!alreadySeenOurInvite) {
            sound.playSound_marimba();
            alreadyPlayedSound = true;
          }
        }
        const classes = ["invite", "button", "unselectable"];
        const isPrivate = invite.publicity === "private";
        if (isPrivate) privateInviteID = invite.id;
        if (ours && !isPrivate) classes.push("ours");
        else if (ours && isPrivate) classes.push("private");
        const newInvite = createDiv(classes, void 0, invite.id);
        const n = ours ? translations["invites"]["you_indicator"] : invite.name;
        const name = createDiv(["invite-child"], n);
        newInvite.appendChild(name);
        const variant2 = createDiv(["invite-child"], translations[invite.variant]);
        newInvite.appendChild(variant2);
        const time = clock.getClockFromKey(invite.clock);
        const cloc = createDiv(["invite-child"], time);
        newInvite.appendChild(cloc);
        const uColor = ours ? invite.color === "White" ? translations["invites"]["you_are_white"] : invite.color === "Black" ? translations["invites"]["you_are_black"] : translations["invites"]["random"] : invite.color === "White" ? translations["invites"]["you_are_black"] : invite.color === "Black" ? translations["invites"]["you_are_white"] : translations["invites"]["random"];
        const color = createDiv(["invite-child"], uColor);
        newInvite.appendChild(color);
        const rated = createDiv(["invite-child"], translations[invite.rated]);
        newInvite.appendChild(rated);
        const a = ours ? translations["invites"]["cancel"] : translations["invites"]["accept"];
        const accept2 = createDiv(["invite-child", "accept"], a);
        newInvite.appendChild(accept2);
        const targetCont = ours ? ourInviteContainer : invitesContainer;
        targetCont.appendChild(newInvite, targetCont);
      }
      if (!alreadyPlayedSound) playBaseIfNewInvite(list);
      weHaveInvite = foundOurs;
      updateCreateInviteButton();
      updatePrivateInviteCode(privateInviteID);
      guiplay.initListeners_Invites();
      if (weHaveInvite && guiplay.getModeSelected() !== "online") cancel();
    }
    const playBaseIfNewInvite = /* @__PURE__ */ (() => {
      const cooldownSecs = 10;
      const recentUsers = {};
      let IDsInLastList = {};
      return function(inviteList) {
        let playedSound = false;
        const newIDsInList = {};
        inviteList.forEach((invite) => {
          const name = invite.name;
          const id = invite.id;
          newIDsInList[id] = true;
          if (IDsInLastList[id]) return;
          if (recentUsers[name]) return;
          if (isInviteOurs(invite)) return;
          recentUsers[name] = true;
          setTimeout(() => {
            delete recentUsers[name];
          }, cooldownSecs * 1e3);
          if (playedSound) return;
          playSoundNewOpponentInvite();
          playedSound = true;
        });
        IDsInLastList = newIDsInList;
      };
    })();
    function playSoundNewOpponentInvite() {
      if (input.isMouseSupported()) sound.playSound_base();
      else sound.playSound_viola_c3();
    }
    function clear({ recentUsersInLastList = false } = {}) {
      guiplay.closeListeners_Invites();
      ourInviteContainer.innerHTML = "";
      invitesContainer.innerHTML = "";
      activeInvites = void 0;
      weHaveInvite = false;
      ourInviteID = void 0;
      element_inviteCodeCode.textContent = "";
      if (recentUsersInLastList) playBaseIfNewInvite([]);
    }
    function clearIfOnPlayPage() {
      if (!guiplay.onPlayPage()) return;
      clear();
      updateCreateInviteButton();
    }
    function isInviteOurs(invite) {
      if (memberHeader.getMember() === invite.name) return true;
      if (!invite.tag) return invite.id === ourInviteID;
      const localStorageTag = localstorage2.loadItem("invite-tag");
      if (!localStorageTag) return false;
      if (invite.tag === localStorageTag) return true;
      return false;
    }
    function getInviteFromElement(inviteElement) {
      const childrenTextContent = style.getChildrenTextContents(inviteElement);
      const id = inviteElement.getAttribute("id");
      return {
        name: childrenTextContent[0],
        variant: childrenTextContent[1],
        clock: childrenTextContent[2],
        color: childrenTextContent[3],
        publicity: childrenTextContent[4],
        rated: childrenTextContent[5],
        id
      };
    }
    function createDiv(classes, textContent, id) {
      const element = document.createElement("div");
      for (let i = 0; i < classes.length; i++) {
        element.classList.add(classes[i]);
      }
      if (textContent) element.textContent = textContent;
      if (id) element.id = id;
      return element;
    }
    function accept(inviteID, isPrivate) {
      const inviteinfo = { id: inviteID, isPrivate };
      guiplay.lockAcceptInviteButton();
      const onreplyFunc = guiplay.unlockAcceptInviteButton;
      websocket.sendmessage("invites", "acceptinvite", inviteinfo, true, onreplyFunc);
    }
    function click(element) {
      const invite = getInviteFromElement(element);
      const isOurs = isInviteOurs(invite);
      if (isOurs) {
        if (!guiplay.isCreateInviteButtonLocked()) cancel(invite.id);
      } else {
        if (!guiplay.isAcceptInviteButtonLocked()) accept(invite.id, true);
      }
    }
    function getInviteFromID(id) {
      if (!id) return console.error("Cannot find the invite with undefined id!");
      for (let i = 0; i < activeInvites.length; i++) {
        const invite = activeInvites[i];
        if (invite.id === id) return invite;
      }
      console.error(`Could not find invite with id ${id} in the document!`);
    }
    function updateCreateInviteButton() {
      if (guiplay.getModeSelected() !== "online") return;
      if (weHaveInvite) guiplay.setElement_CreateInviteTextContent(translations["invites"]["cancel_invite"]);
      else guiplay.setElement_CreateInviteTextContent(translations["invites"]["create_invite"]);
    }
    function updatePrivateInviteCode(privateInviteID) {
      if (guiplay.getModeSelected() === "local") return;
      if (!weHaveInvite) {
        guiplay.showElement_joinPrivate();
        guiplay.hideElement_inviteCode();
        return;
      }
      if (privateInviteID) {
        guiplay.hideElement_joinPrivate();
        guiplay.showElement_inviteCode();
        element_inviteCodeCode.textContent = privateInviteID.toUpperCase();
        return;
      }
      guiplay.showElement_joinPrivate();
      guiplay.hideElement_inviteCode();
    }
    function updateActiveGameCount(newCount) {
      if (newCount == null) return;
      element_joinExisting.textContent = `${translations["invites"]["join_existing_active_games"]} ${newCount}`;
    }
    function doWeHave() {
      return weHaveInvite;
    }
    async function subscribeToInvites(ignoreAlreadySubbed) {
      if (!guiplay.onPlayPage()) return;
      const subs = websocket.getSubs();
      if (!ignoreAlreadySubbed && subs.invites) return;
      subs.invites = true;
      websocket.sendmessage("general", "sub", "invites");
    }
    return Object.freeze({
      gelement_iCodeCode,
      onmessage,
      update,
      create,
      cancel,
      clear,
      accept,
      click,
      doWeHave,
      clearIfOnPlayPage,
      unsubIfWeNotHave,
      deleteInviteTagInLocalStorage,
      subscribeToInvites
    });
  }();

  // src/client/scripts/game/websocket.mjs
  var websocket = function() {
    let socket;
    let openingSocket = false;
    let reqOut = false;
    let noConnection = false;
    let inTimeout = false;
    const cushionBeforeAutoCloseMillis = 1e4;
    let timeoutIDToAutoClose;
    const validSubs = ["invites", "game"];
    const subs = {
      invites: false,
      game: false
    };
    const timeToResubAfterNetworkLossMillis = 5e3;
    const timeToResubAfterTooManyRequestsMillis = 1e4;
    const timeToResubAfterMessageTooBigMillis = timeToResubAfterNetworkLossMillis;
    const timeToWaitForHTTPMillis = 5e3;
    const timeToWaitForEchoMillis = 5e3;
    let echoTimers = {};
    let onreplyFuncs = {};
    const timerIDsToCancelOnNewSocket = [];
    const printAllSentMessages = true;
    const alsoPrintSentEchos = false;
    const printAllIncomingMessages = true;
    const alsoPrintIncomingEchos = false;
    function getSubs() {
      return subs;
    }
    async function establishSocket() {
      if (inTimeout) return false;
      while (openingSocket || socket && socket.readyState !== WebSocket.OPEN) {
        if (main2.devBuild) console.log("Waiting for the socket to be established or closed..");
        await main2.sleep(100);
      }
      if (socket && socket.readyState === WebSocket.OPEN) return true;
      openingSocket = true;
      let success = await openSocket();
      while (!success && !zeroSubs()) {
        noConnection = true;
        statustext2.showStatusForDuration(translations["websocket"]["no_connection"], timeToResubAfterNetworkLossMillis);
        onlinegame2.onLostConnection();
        invites.clearIfOnPlayPage();
        await main2.sleep(timeToResubAfterNetworkLossMillis);
        success = await openSocket();
      }
      if (success && noConnection) statustext2.showStatusForDuration(translations["websocket"]["reconnected"], 1e3);
      noConnection = false;
      cancelAllTimerIDsToCancelOnNewSocket();
      openingSocket = false;
      return success;
    }
    async function openSocket() {
      onReqLeave();
      return new Promise((resolve, reject) => {
        let url = `wss://${window.location.hostname}`;
        if (window.location.port !== "443") url += `:${window.location.port}`;
        const ws = new WebSocket(url);
        ws.onopen = () => {
          onReqBack();
          socket = ws;
          resolve(true);
        };
        ws.onerror = (event2) => {
          onReqBack();
          resolve(false);
        };
        ws.onmessage = onmessage;
        ws.onclose = onclose;
      });
    }
    function onReqLeave() {
      reqOut = setTimeout(httpLostConnection, timeToWaitForHTTPMillis);
    }
    function onReqBack() {
      clearTimeout(reqOut);
      reqOut = false;
    }
    function httpLostConnection() {
      noConnection = true;
      statustext2.showStatusForDuration(translations["websocket"]["no_connection"], timeToWaitForHTTPMillis);
      reqOut = setTimeout(httpLostConnection, timeToWaitForHTTPMillis);
    }
    function cancelTimerOfMessageID(message) {
      const echoMessageID = message.value;
      const timeoutID = echoTimers[echoMessageID];
      clearTimeout(timeoutID);
      delete echoTimers[echoMessageID];
    }
    function renewConnection(messageID) {
      if (messageID) {
        delete echoTimers[messageID];
      }
      if (!socket) return;
      console.log(`Renewing connection after we haven't received an echo for ${timeToWaitForEchoMillis} milliseconds...`);
      noConnection = true;
      statustext2.showStatusForDuration(translations["websocket"]["no_connection"], timeToWaitForHTTPMillis);
      socket.close(1e3, "Connection closed by client. Renew.");
    }
    function onmessage(serverMessage) {
      let message;
      try {
        message = JSON.parse(serverMessage.data);
      } catch (error) {
        return console.error("Error parsing incoming message as JSON:", error);
      }
      const isEcho = message.action === "echo";
      if (printAllIncomingMessages && main2.devBuild) {
        if (isEcho) {
          if (alsoPrintIncomingEchos) console.log(`Incoming message: ${JSON.stringify(message)}`);
        } else console.log(`Incoming message: ${JSON.stringify(message)}`);
      }
      if (isEcho) return cancelTimerOfMessageID(message);
      const sub = message.sub;
      sendmessage("general", "echo", message.id);
      executeOnreplyFunc(message.replyto);
      switch (sub) {
        // Route the message where it needs to go
        case void 0:
          break;
        case "general":
          ongeneralmessage(message.action, message.value);
          break;
        case "invites":
          invites.onmessage(message);
          break;
        case "game":
          onlinegame2.onmessage(message);
          break;
        default:
          console.error("Unknown socket subscription received from the server! Message:");
          return console.log(message);
      }
    }
    function ongeneralmessage(action, value) {
      switch (action) {
        case "notify":
          statustext2.showStatus(value);
          break;
        case "notifyerror":
          statustext2.showStatus(value, true, 2);
          break;
        case "print":
          console.log(value);
          break;
        case "printerror":
          console.error(value);
          break;
        case "renewconnection":
          break;
        case "gameversion":
          if (value !== main2.GAME_VERSION) handleHardRefresh(value);
          break;
        default:
          console.log(`We don't know how to treat this server action in general route: Action "${action}". Value: ${value}`);
      }
    }
    function handleHardRefresh(GAME_VERSION) {
      if (!GAME_VERSION) throw new Error("Can't hard refresh with no expected version.");
      const reloadInfo = {
        timeLastHardRefreshed: Date.now(),
        expectedVersion: GAME_VERSION
      };
      const preexistingHardRefreshInfo = localstorage.loadItem("hardrefreshinfo");
      if (preexistingHardRefreshInfo?.expectedVersion === GAME_VERSION) {
        if (!preexistingHardRefreshInfo.sentNotSupported) sendFeatureNotSupported(`location.reload(true) failed to hard refresh. Server version: ${GAME_VERSION}. Still running: ${main2.GAME_VERSION}`);
        preexistingHardRefreshInfo.sentNotSupported = true;
        saveInfo(preexistingHardRefreshInfo);
        return;
      }
      saveInfo(reloadInfo);
      location.reload(true);
      function saveInfo(info) {
        localstorage.saveItem("hardrefreshinfo", info, math2.getTotalMilliseconds({ days: 1 }));
      }
    }
    function sendFeatureNotSupported(description) {
      sendmessage("general", "feature-not-supported", description);
    }
    function onclose(event2) {
      if (main2.devBuild) console.log("WebSocket connection closed:", event2.code, event2.reason);
      const wasFullyOpen = socket !== void 0;
      socket = void 0;
      cancelAllEchoTimers();
      resetOnreplyFuncs();
      onlinegame2.setInSyncFalse();
      guiplay.onSocketClose();
      if (event2.code === 1006) {
        if (wasFullyOpen) resubAll();
        return;
      }
      const trimmedReason = event2.reason.trim();
      switch (trimmedReason) {
        case "Connection expired":
          resubAll();
          break;
        case "Connection closed by client":
          break;
        case "Connection closed by client. Renew.":
          console.log("Closed web socket successfully. Renewing now..");
          resubAll();
          break;
        case "Unable to identify client IP address":
          statustext2.showStatus(`${translations["websocket"]["unable_to_identify_ip"]} ${translations["websocket"]["please_report_bug"]}`, true, 100);
          invites.clearIfOnPlayPage();
          break;
        // Don't resub
        case "Authentication needed":
          statustext2.showStatus(translations["websocket"]["online_play_disabled"]);
          invites.clearIfOnPlayPage();
          break;
        // Don't resub
        case "Logged out":
          memberHeader.onLogOut();
          resubAll();
          break;
        case "Too Many Requests. Try again soon.":
          statustext2.showStatusForDuration(translations["websocket"]["too_many_requests"], timeToResubAfterTooManyRequestsMillis);
          enterTimeout(timeToResubAfterTooManyRequestsMillis);
          break;
        case "Message Too Big":
          statustext2.showStatus(`${translations["websocket"]["message_too_big"]} ${translations["websocket"]["please_report_bug"]}`, true, 3);
          enterTimeout(timeToResubAfterMessageTooBigMillis);
          break;
        case "Too Many Sockets":
          statustext2.showStatus(`${translations["websocket"]["too_many_sockets"]} ${translations["websocket"]["please_report_bug"]}`, true, 3);
          setTimeout(resubAll, timeToResubAfterTooManyRequestsMillis);
          break;
        case "Origin Error":
          statustext2.showStatus(`${translations["websocket"]["origin_error"]} ${translations["websocket"]["please_report_bug"]}`, true, 3);
          invites.clearIfOnPlayPage();
          enterTimeout(timeToResubAfterTooManyRequestsMillis);
          break;
        case "No echo heard":
          noConnection = true;
          statustext2.showStatusForDuration(translations["websocket"]["no_connection"], timeToWaitForHTTPMillis);
          resubAll();
          break;
        default:
          statustext2.showStatus(`${translations["websocket"]["connection_closed"]} "${trimmedReason}" ${translations["websocket"]["please_report_bug"]}`, true, 100);
          console.error("Unknown reason why the WebSocket connection was closed. Not reopening or resubscribing.");
      }
    }
    function enterTimeout(timeMillis) {
      if (timeMillis === void 0) return console.error("Cannot enter timeout for an undefined amount of time!");
      if (inTimeout) return;
      inTimeout = true;
      setTimeout(leaveTimeout, timeMillis);
      invites.clearIfOnPlayPage();
    }
    function leaveTimeout() {
      inTimeout = false;
      resubAll();
    }
    async function sendmessage(route, action, value, isUserAction, onreplyFunc) {
      if (!await establishSocket()) {
        if (isUserAction) statustext2.showStatus(translations["websocket"]["too_many_requests"]);
        if (onreplyFunc) onreplyFunc();
        return false;
      }
      resetTimerToCloseSocket();
      const payload = {
        route,
        // general/invites/game
        action,
        // sub/unsub/createinvite/cancelinvite/acceptinvite
        value
        // sublist/inviteinfo
      };
      const isEcho = action === "echo";
      if (!isEcho) payload.id = math2.generateNumbID(10);
      if (printAllSentMessages && main2.devBuild) {
        if (isEcho) {
          if (alsoPrintSentEchos) console.log(`Sending: ${JSON.stringify(payload)}`);
        } else console.log(`Sending: ${JSON.stringify(payload)}`);
      }
      if (!isEcho) echoTimers[payload.id] = setTimeout(renewConnection, timeToWaitForEchoMillis, payload.id);
      if (!isEcho) scheduleOnreplyFunc(payload.id, onreplyFunc);
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(payload));
      return true;
    }
    function cancelAllEchoTimers() {
      const echoTimersKeys = Object.keys(echoTimers);
      for (const timeoutIDKey of echoTimersKeys) {
        const timeoutIDValue = echoTimers[timeoutIDKey];
        clearTimeout(timeoutIDValue);
      }
      echoTimers = {};
    }
    function scheduleOnreplyFunc(messageID, onreplyFunc) {
      if (!onreplyFunc) return;
      onreplyFuncs[messageID] = onreplyFunc;
    }
    function executeOnreplyFunc(id) {
      if (id === void 0) return;
      if (!onreplyFuncs[id]) return;
      onreplyFuncs[id]();
      delete onreplyFuncs[id];
    }
    function resetOnreplyFuncs() {
      onreplyFuncs = {};
    }
    function cancelAllTimerIDsToCancelOnNewSocket() {
      timerIDsToCancelOnNewSocket.forEach((ID) => {
        clearTimeout(ID);
      });
    }
    function addTimerIDToCancelOnNewSocket(ID) {
      timerIDsToCancelOnNewSocket.push(ID);
    }
    function closeSocket() {
      if (!socket) return;
      if (socket.readyState !== WebSocket.OPEN) return console.error("Cannot close socket because it's not open! Yet socket is defined.");
      socket.close(1e3, "Connection closed by client");
    }
    function resetTimerToCloseSocket() {
      clearTimeout(timeoutIDToAutoClose);
      if (zeroSubs()) timeoutIDToAutoClose = setTimeout(closeSocket, cushionBeforeAutoCloseMillis);
    }
    function zeroSubs() {
      for (const sub of validSubs) if (subs[sub] === true) return false;
      return true;
    }
    function unsubAll() {
      for (const sub of validSubs) subs[sub] = false;
    }
    async function resubAll() {
      if (main2.devBuild) console.log("Resubbing all..");
      if (zeroSubs()) {
        noConnection = false;
        return console.log("No subs to sub to.");
      } else {
        if (!await establishSocket()) return false;
      }
      for (const sub of validSubs) {
        if (subs[sub] === false) continue;
        switch (sub) {
          case "invites":
            await invites.subscribeToInvites(true);
            break;
          case "game":
            onlinegame2.resyncToGame();
            break;
          default:
            return console.error(`Cannot resub to all subs after an unexpected socket closure with strange sub ${sub}!`);
        }
      }
    }
    function unsubFromInvites() {
      invites.clear({ recentUsersInLastList: true });
      if (subs.invites === false) return;
      subs.invites = false;
      sendmessage("general", "unsub", "invites");
    }
    window.addEventListener("pageshow", function(event2) {
      if (event2.persisted) {
        console.log("Page was returned to using the back or forward button.");
        resubAll();
      } else {
      }
    });
    return Object.freeze({
      closeSocket,
      sendmessage,
      unsubFromInvites,
      getSubs,
      addTimerIDToCancelOnNewSocket
    });
  }();

  // src/client/scripts/game/misc/loadbalancer.mjs
  var loadbalancer2 = function() {
    let runTime;
    let deltaTime;
    let lastFrameTime = 0;
    let lastAnimationLength = 0;
    const fpsWindow = 1e3;
    const frames = [];
    let fps = 0;
    let monitorRefreshRate = 0;
    let idealTimePerFrame = 0;
    let timeForLongTasks = 0;
    const minLongTaskRatio = 1;
    const damping = 1;
    const refreshPeriod = 1e3;
    const stayConnectedPeriod = 5e3;
    const refreshPeriodAFK = 5e3;
    let isAFK = false;
    const timeUntilAFK = { normal: 3e4, dev: 2e3 };
    let AFKTimeoutID;
    let isHibernating = false;
    const timeUntilHibernation = 1e3 * 60 * 60;
    let hibernateTimeoutID;
    let windowInFocus = true;
    let windowIsVisible = true;
    const timeToDeleteInviteAfterPageHiddenMillis = 1e3 * 60 * 30;
    let timeToDeleteInviteTimeoutID;
    function getRunTime() {
      return runTime;
    }
    function getDeltaTime() {
      return deltaTime;
    }
    function getTimeUntilAFK() {
      return main2.devBuild ? timeUntilAFK.dev : timeUntilAFK.normal;
    }
    function gisAFK() {
      return isAFK;
    }
    function gisHibernating() {
      return isHibernating;
    }
    function isPageHidden() {
      return !windowIsVisible;
    }
    function update(runtime) {
      updateDeltaTime(runtime);
      frames.push(runTime);
      trimFrames();
      updateFPS();
      updateMonitorRefreshRate();
      updateAFK();
    }
    function updateDeltaTime(runtime) {
      runTime = runtime;
      deltaTime = (runTime - lastFrameTime) / 1e3;
      lastFrameTime = runTime;
    }
    function trimFrames() {
      const splitPoint = runTime - fpsWindow;
      const indexToSplit = math2.binarySearch_findValue(frames, splitPoint);
      frames.splice(0, indexToSplit);
    }
    function updateFPS() {
      fps = frames.length * 1e3 / fpsWindow;
      stats.updateFPS(fps);
    }
    function updateMonitorRefreshRate() {
      if (fps <= monitorRefreshRate) return;
      monitorRefreshRate = fps;
      recalcIdealTimePerFrame();
    }
    function recalcIdealTimePerFrame() {
      idealTimePerFrame = 1e3 / monitorRefreshRate;
    }
    function getLongTaskTime() {
      return timeForLongTasks;
    }
    function timeAnimationFrame() {
      lastAnimationLength = performance.now() - runTime;
      updateTimeForLongTasks();
    }
    function updateTimeForLongTasks() {
      timeForLongTasks = idealTimePerFrame - lastAnimationLength - damping;
      const minTime = lastAnimationLength * minLongTaskRatio;
      timeForLongTasks = Math.max(timeForLongTasks, minTime);
      timeForLongTasks = Math.min(timeForLongTasks, idealTimePerFrame);
    }
    function updateAFK() {
      if (activityThisFrame()) onReturnFromAFK();
    }
    function activityThisFrame() {
      return input2.atleast1InputThisFrame();
    }
    function onReturnFromAFK() {
      isAFK = false;
      isHibernating = false;
      restartAFKTimer();
      restartHibernateTimer();
      invites.subscribeToInvites();
    }
    function restartAFKTimer() {
      clearTimeout(AFKTimeoutID);
      AFKTimeoutID = setTimeout(onAFK, getTimeUntilAFK());
    }
    function restartHibernateTimer() {
      clearTimeout(hibernateTimeoutID);
      hibernateTimeoutID = setTimeout(onHibernate, timeUntilHibernation);
    }
    function onAFK() {
      isAFK = true;
      AFKTimeoutID = void 0;
    }
    function onHibernate() {
      if (invites.doWeHave()) return restartHibernateTimer();
      isHibernating = true;
      hibernateTimeoutID = void 0;
      websocket.unsubFromInvites();
    }
    window.addEventListener("focus", () => {
      windowInFocus = true;
    });
    window.addEventListener("blur", function() {
      windowInFocus = false;
    });
    document.addEventListener("visibilitychange", function() {
      if (document.hidden) {
        windowIsVisible = false;
        timeToDeleteInviteTimeoutID = setTimeout(invites.cancel, timeToDeleteInviteAfterPageHiddenMillis);
      } else {
        windowIsVisible = true;
        cancelTimerToDeleteInviteAfterLeavingPage();
        onlinegame2.cancelMoveSound();
      }
    });
    function cancelTimerToDeleteInviteAfterLeavingPage() {
      clearTimeout(timeToDeleteInviteTimeoutID);
      timeToDeleteInviteTimeoutID = void 0;
    }
    return Object.freeze({
      getRunTime,
      getDeltaTime,
      update,
      getLongTaskTime,
      timeAnimationFrame,
      refreshPeriod,
      refreshPeriodAFK,
      stayConnectedPeriod,
      gisAFK,
      gisHibernating,
      isPageHidden
    });
  }();

  // src/client/scripts/game/rendering/movement.mjs
  var movement = function() {
    const panAccel = 50;
    let panVelCap = 11;
    const scaleAccel = 6;
    const scaleVelCap = 1;
    const maximumScale = 20;
    const scrollScaleVel = 0.015;
    const scrollScaleVelCap = 2.5;
    const passwordForSetting = "pidough";
    let boardPos = [0, 0];
    let panVel = [0, 0];
    let boardScale = 1;
    let scaleVel = 0;
    let boardIsGrabbed = 0;
    let boardPosMouseGrabbed;
    let boardPosFingerOneGrabbed;
    let boardPosFingerTwoGrabbed;
    let scale_WhenBoardPinched;
    let fingerPixelDist_WhenBoardPinched;
    let scale_When1TileIs1Pixel_Physical;
    let scale_When1TileIs1Pixel_Virtual;
    let scaleIsLess1Pixel_Physical = false;
    let scaleIsLess1Pixel_Virtual = false;
    function getBoardPos() {
      return math2.copyCoords(boardPos);
    }
    function setBoardPos(newPos, password) {
      if (password !== passwordForSetting) return newPos;
      if (!Array.isArray(newPos)) return console.error(`New position must be an array! ${newPos}`);
      if (isNaN(newPos[0]) || isNaN(newPos[1])) return console.error(`Cannot set position to ${newPos}!`);
      boardPos = newPos;
      main2.renderThisFrame();
    }
    function getBoardScale() {
      return boardScale;
    }
    function setBoardScale(newScale, password) {
      if (password !== passwordForSetting) {
        if (main2.devBuild) console.error("Incorrect pass");
        return newScale;
      }
      if (isNaN(newScale)) return console.error(`Cannot set scale to ${newScale}!`);
      if (newScale <= 0) {
        console.error(`Cannot set scale to ${newScale}!!`);
        return console.trace();
      }
      boardScale = newScale;
      if (boardScale > maximumScale) {
        boardScale = maximumScale;
        scaleVel = 0;
      }
      if (boardScale < scale_When1TileIs1Pixel_Physical) scaleIsLess1Pixel_Physical = true;
      else scaleIsLess1Pixel_Physical = false;
      if (boardScale < scale_When1TileIs1Pixel_Virtual) scaleIsLess1Pixel_Virtual = true;
      else scaleIsLess1Pixel_Virtual = false;
      main2.renderThisFrame();
    }
    function setPanVelCap(newPanVelCap) {
      if (!main2.devBuild) return;
      panVelCap = newPanVelCap;
    }
    function getScale_When1TileIs1Pixel_Physical() {
      return scale_When1TileIs1Pixel_Physical;
    }
    function setScale_When1TileIs1Pixel_Physical(newValue) {
      scale_When1TileIs1Pixel_Physical = newValue;
    }
    function getScale_When1TileIs1Pixel_Virtual() {
      return scale_When1TileIs1Pixel_Virtual;
    }
    function setScale_When1TileIs1Pixel_Virtual(newValue) {
      scale_When1TileIs1Pixel_Virtual = newValue;
    }
    function isScaleLess1Pixel_Physical() {
      return scaleIsLess1Pixel_Physical;
    }
    function isScaleLess1Pixel_Virtual() {
      return scaleIsLess1Pixel_Virtual;
    }
    function recalcPosition() {
      if (transition2.areWeTeleporting()) return;
      panBoard();
      recalcScale();
    }
    function panBoard() {
      if (loadbalancer2.gisAFK()) return;
      if (panVel[0] === 0 && panVel[1] === 0) return;
      main2.renderThisFrame();
      boardPos[0] += loadbalancer2.getDeltaTime() * panVel[0] / boardScale;
      boardPos[1] += loadbalancer2.getDeltaTime() * panVel[1] / boardScale;
    }
    function recalcScale() {
      if (scaleVel === 0) return;
      const damp = scaleVel > 0 || boardScale > board2.glimitToDampScale() ? 1 : boardScale / board2.glimitToDampScale();
      main2.renderThisFrame();
      const newScale = boardScale * (1 + loadbalancer2.getDeltaTime() * scaleVel * damp);
      setBoardScale(newScale, passwordForSetting);
    }
    function updateNavControls() {
      checkIfBoardDropped();
      if (transition2.areWeTeleporting()) return;
      if (guipromotion.isUIOpen()) {
        decceleratePanVel();
        deccelerateScaleVel();
        return;
      }
      checkIfBoardDragged();
      detectPanning();
      detectZooming();
    }
    function checkIfBoardDropped() {
      if (boardIsGrabbed === 0) return;
      if (boardIsGrabbed === 1) {
        if (!input2.isMouseHeld_Left()) boardIsGrabbed = 0;
        return;
      }
      const touchHeldsLength = input2.getTouchHelds().length;
      if (touchHeldsLength !== 0) return;
      boardIsGrabbed = 0;
      boardPosFingerTwoGrabbed = void 0;
      return;
    }
    function checkIfBoardDragged() {
      if (perspective2.getEnabled()) return;
      if (boardIsGrabbed === 0) {
        if (input2.isMouseDown_Left()) grabBoard_WithMouse();
        else if (input2.getTouchHelds().length > 0) grabBoard_WithFinger();
      } else if (boardIsGrabbed === 2) updateBoardPinch();
    }
    function grabBoard_WithMouse() {
      boardIsGrabbed = 1;
      const tile_MouseOver_Float = board2.gtile_MouseOver_Float();
      boardPosMouseGrabbed = [tile_MouseOver_Float[0], tile_MouseOver_Float[1]];
      erasePanVelocity();
    }
    function erasePanVelocity() {
      panVel = [0, 0];
    }
    function grabBoard_WithFinger() {
      boardIsGrabbed = 2;
      erasePanVelocity();
      const fingerOneOrTwo = 1;
      recalcPositionFingerGrabbedBoard(fingerOneOrTwo);
      if (input2.getTouchHelds().length > 1) initBoardPinch();
    }
    function recalcPositionFingerGrabbedBoard(fingerOneOrTwo) {
      if (fingerOneOrTwo === 1) boardPosFingerOneGrabbed = board2.gpositionFingerOver(input2.getTouchHelds()[0].id);
      else boardPosFingerTwoGrabbed = board2.gpositionFingerOver(input2.getTouchHelds()[1].id);
    }
    function initBoardPinch() {
      const fingerOneOrTwo = 2;
      recalcPositionFingerGrabbedBoard(fingerOneOrTwo);
      scale_WhenBoardPinched = boardScale;
      const touch1 = input2.getTouchHeldByID(boardPosFingerOneGrabbed.id);
      const touch2 = input2.getTouchHeldByID(boardPosFingerTwoGrabbed.id);
      const xDiff = touch1.x - touch2.x;
      const yDiff = touch1.y - touch2.y;
      fingerPixelDist_WhenBoardPinched = Math.hypot(xDiff, yDiff);
    }
    function updateBoardPinch() {
      const touchHeldsLength = input2.getTouchHelds().length;
      if (boardPosFingerTwoGrabbed === void 0) {
        if (touchHeldsLength === 1) {
          if (boardPosFingerOneGrabbed.id !== input2.getTouchHelds()[0].id) recalcPositionFingerGrabbedBoard(1);
        } else if (touchHeldsLength > 1) {
          const touchHeldsIncludesTouch1 = input2.touchHeldsIncludesID(boardPosFingerOneGrabbed.id);
          if (!touchHeldsIncludesTouch1) recalcPositionFingerGrabbedBoard(1);
          initBoardPinch();
        }
      } else {
        if (touchHeldsLength === 1) {
          recalcPositionFingerGrabbedBoard(1);
          boardPosFingerTwoGrabbed = void 0;
        } else if (touchHeldsLength > 1) {
          const touchHeldsIncludesTouch1 = input2.touchHeldsIncludesID(boardPosFingerOneGrabbed.id);
          const touchHeldsIncludesTouch2 = input2.touchHeldsIncludesID(boardPosFingerTwoGrabbed.id);
          if (!touchHeldsIncludesTouch1 || !touchHeldsIncludesTouch2) {
            const fingerOneOrTwo = 1;
            recalcPositionFingerGrabbedBoard(fingerOneOrTwo);
            initBoardPinch();
          }
        }
      }
    }
    function detectPanning() {
      if (boardIsGrabbed !== 0) return;
      let panning = false;
      if (input2.atleast1KeyHeld()) {
        if (input2.isKeyHeld("d")) {
          panning = true;
          panAccel_Perspective(0);
        }
        if (input2.isKeyHeld("a")) {
          panning = true;
          panAccel_Perspective(180);
        }
        if (input2.isKeyHeld("w")) {
          panning = true;
          panAccel_Perspective(90);
        }
        if (input2.isKeyHeld("s")) {
          panning = true;
          panAccel_Perspective(-90);
        }
      }
      if (panning) {
        const hyp = Math.hypot(...panVel);
        const ratio = panVelCap / hyp;
        if (ratio < 1) {
          panVel[0] *= ratio;
          panVel[1] *= ratio;
        }
      } else decceleratePanVel();
    }
    function panAccel_Perspective(angle) {
      const baseAngle = -perspective2.getRotZ();
      const dirOfTravel = baseAngle + angle;
      const angleRad = math2.toRadians(dirOfTravel);
      const XYComponents = math2.getXYComponents_FromAngle(angleRad);
      panVel[0] += loadbalancer2.getDeltaTime() * panAccel * XYComponents[0];
      panVel[1] += loadbalancer2.getDeltaTime() * panAccel * XYComponents[1];
    }
    function decceleratePanVel() {
      if (panVel[0] === 0 && panVel[1] === 0) return;
      const hyp = Math.hypot(...panVel);
      const ratio = (hyp - loadbalancer2.getDeltaTime() * panAccel) / hyp;
      if (ratio < 0) panVel = [0, 0];
      else {
        panVel[0] *= ratio;
        panVel[1] *= ratio;
      }
    }
    function deccelerateScaleVel() {
      if (scaleVel === 0) return;
      if (scaleVel > 0) {
        scaleVel -= loadbalancer2.getDeltaTime() * scaleAccel;
        if (scaleVel < 0) scaleVel = 0;
      } else {
        scaleVel += loadbalancer2.getDeltaTime() * scaleAccel;
        if (scaleVel > 0) scaleVel = 0;
      }
    }
    function detectZooming() {
      let scaling = false;
      if (input2.isKeyHeld(" ")) {
        scaling = true;
        scaleVel -= loadbalancer2.getDeltaTime() * scaleAccel;
        if (scaleVel < -scaleVelCap) scaleVel = -scaleVelCap;
      }
      if (input2.isKeyHeld("shift")) {
        scaling = true;
        scaleVel += loadbalancer2.getDeltaTime() * scaleAccel;
        if (scaleVel > scaleVelCap) scaleVel = scaleVelCap;
      }
      if (!scaling) deccelerateScaleVel();
      if (input2.getMouseWheel() !== 0) {
        scaleVel -= scrollScaleVel * input2.getMouseWheel();
        if (scaleVel > scrollScaleVelCap) scaleVel = scrollScaleVelCap;
        else if (scaleVel < -scrollScaleVelCap) scaleVel = -scrollScaleVelCap;
      }
    }
    function randomizePanVelDir() {
      const randTheta = Math.random() * 2 * Math.PI;
      const XYComponents = math2.getXYComponents_FromAngle(randTheta);
      panVel[0] = XYComponents[0] * guititle.boardVel;
      panVel[1] = XYComponents[1] * guititle.boardVel;
    }
    function dragBoard() {
      if (boardIsGrabbed === 1) dragBoard_WithMouse();
      else if (boardIsGrabbed === 2) dragBoard_WithFingers();
    }
    function dragBoard_WithMouse() {
      main2.renderThisFrame();
      const n = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      const newBoardX = boardPosMouseGrabbed[0] - n * input2.getMousePos()[0] / board2.gtileWidth_Pixels();
      const newBoardY = boardPosMouseGrabbed[1] - n * input2.getMousePos()[1] / board2.gtileWidth_Pixels();
      boardPos = [newBoardX, newBoardY];
    }
    function dragBoard_WithFingers() {
      main2.renderThisFrame();
      const n = perspective2.getIsViewingBlackPerspective() ? -1 : 1;
      if (boardPosFingerTwoGrabbed === void 0) {
        const touch = input2.getTouchHelds()[0];
        const newBoardX2 = boardPosFingerOneGrabbed.x - n * touch.x / board2.gtileWidth_Pixels();
        const newBoardY2 = boardPosFingerOneGrabbed.y - n * touch.y / board2.gtileWidth_Pixels();
        input2.moveMouse(touch);
        boardPos = [newBoardX2, newBoardY2];
        return;
      }
      const grabDiffX = boardPosFingerTwoGrabbed.x - boardPosFingerOneGrabbed.x;
      const grabDiffY = boardPosFingerTwoGrabbed.y - boardPosFingerOneGrabbed.y;
      const grabMidX = boardPosFingerOneGrabbed.x + grabDiffX / 2;
      const grabMidY = boardPosFingerOneGrabbed.y + grabDiffY / 2;
      const touchHeld1 = input2.getTouchHeldByID(boardPosFingerOneGrabbed.id);
      const touchHeld2 = input2.getTouchHeldByID(boardPosFingerTwoGrabbed.id);
      const screenDiffX = touchHeld2.x - touchHeld1.x;
      const screenDiffY = touchHeld2.y - touchHeld1.y;
      const screenMidX = touchHeld1.x + screenDiffX / 2;
      const screenMidY = touchHeld1.y + screenDiffY / 2;
      const newBoardX = grabMidX - n * (screenMidX / board2.gtileWidth_Pixels());
      const newBoardY = grabMidY - n * (screenMidY / board2.gtileWidth_Pixels());
      boardPos = [newBoardX, newBoardY];
      const point1 = [touchHeld1.x, touchHeld1.y];
      const point2 = [touchHeld2.x, touchHeld2.y];
      const thisPixelDist = math2.euclideanDistance(point1, point2);
      let ratio = thisPixelDist / fingerPixelDist_WhenBoardPinched;
      if (scale_WhenBoardPinched < board2.glimitToDampScale() && ratio < 1) {
        const dampener = scale_WhenBoardPinched / board2.glimitToDampScale();
        ratio = (ratio - 1) * dampener + 1;
      }
      const newScale = scale_WhenBoardPinched * ratio;
      setBoardScale(newScale, passwordForSetting);
      input2.moveMouse(touchHeld1, touchHeld2);
    }
    function eraseMomentum() {
      panVel = [0, 0];
      scaleVel = 0;
    }
    function setPositionToArea(area2, password) {
      if (!area2) console.error("Cannot set position to an undefined area.");
      const copiedCoords = math2.copyCoords(area2.coords);
      setBoardPos(copiedCoords, password);
      setBoardScale(area2.scale, password);
    }
    return Object.freeze({
      getScale_When1TileIs1Pixel_Physical,
      setScale_When1TileIs1Pixel_Physical,
      getScale_When1TileIs1Pixel_Virtual,
      setScale_When1TileIs1Pixel_Virtual,
      setPanVelCap,
      isScaleLess1Pixel_Physical,
      isScaleLess1Pixel_Virtual,
      getBoardPos,
      setBoardPos,
      getBoardScale,
      setBoardScale,
      recalcPosition,
      panBoard,
      updateNavControls,
      randomizePanVelDir,
      dragBoard,
      eraseMomentum,
      setPositionToArea
    });
  }();

  // src/client/scripts/game/misc/math.mjs
  var math2 = function() {
    function isPowerOfTwo(value) {
      return (value & value - 1) === 0;
    }
    function isAproxEqual(a, b, epsilon = Number.EPSILON) {
      return Math.abs(a - b) < epsilon;
    }
    function getLineIntersection(dx1, dy1, c1, dx2, dy2, c2) {
      const denominator = dx1 * dy2 - dx2 * dy1;
      if (denominator === 0) {
        return null;
      }
      const x = (dx2 * c1 - dx1 * c2) / denominator;
      const y = (dy2 * c1 - dy1 * c2) / denominator;
      return [x, y];
    }
    function getXYComponents_FromAngle(theta) {
      return [Math.cos(theta), Math.sin(theta)];
    }
    function roundPointToNearestGridpoint(point, gridSize) {
      const nearestX = Math.round(point[0] / gridSize) * gridSize;
      const nearestY = Math.round(point[1] / gridSize) * gridSize;
      return [nearestX, nearestY];
    }
    function boxContainsBox(outerBox, innerBox) {
      if (innerBox.left < outerBox.left) return false;
      if (innerBox.right > outerBox.right) return false;
      if (innerBox.bottom < outerBox.bottom) return false;
      if (innerBox.top > outerBox.top) return false;
      return true;
    }
    function boxContainsSquare(box, square) {
      if (!square) console.log("We need a square to test if it's within this box!");
      if (typeof square[0] !== "number") console.log("Square is of the wrong data type!");
      if (square[0] < box.left) return false;
      if (square[0] > box.right) return false;
      if (square[1] < box.bottom) return false;
      if (square[1] > box.top) return false;
      return true;
    }
    function getBoxFromCoordsList(coordsList) {
      if (coordsList == null) return console.error("Coords not specified when calculating the bounding box of a coordinate list!");
      else if (coordsList.length === 0) return console.error("Cannot calculate the bounding box of 0 coordinates!");
      const box = {};
      const firstPiece = coordsList.shift();
      box.left = firstPiece[0];
      box.right = firstPiece[0];
      box.bottom = firstPiece[1];
      box.top = firstPiece[1];
      for (const coord of coordsList) expandBoxToContainSquare(box, coord);
      return box;
    }
    function expandBoxToContainSquare(box, coord) {
      if (!box) return console.error("Cannot expand an undefined box to fit a square!");
      if (!coord) return console.error("Undefined coords shouldn't be passed into math.expandBoxToContainSquare()!");
      if (coord[0] < box.left) box.left = coord[0];
      else if (coord[0] > box.right) box.right = coord[0];
      if (coord[1] < box.bottom) box.bottom = coord[1];
      else if (coord[1] > box.top) box.top = coord[1];
    }
    function mergeBoundingBoxes(box1, box2) {
      if (!box1 || !box2) return console.error("Cannot merge 2 bounding boxes when 1+ isn't defined.");
      const mergedBox = {
        left: box1.left < box2.left ? box1.left : box2.left,
        right: box1.right > box2.right ? box1.right : box2.right,
        bottom: box1.bottom < box2.bottom ? box1.bottom : box2.bottom,
        top: box1.top > box2.top ? box1.top : box2.top
      };
      return mergedBox;
    }
    function getBoundingBoxOfBoard(position = movement.getBoardPos(), scale = movement.getBoardScale()) {
      const distToHorzEdgeDivScale = camera2.getScreenBoundingBox().right / scale;
      const left = position[0] - distToHorzEdgeDivScale;
      const right = position[0] + distToHorzEdgeDivScale;
      const distToVertEdgeDivScale = camera2.getScreenBoundingBox().top / scale;
      const bottom = position[1] - distToVertEdgeDivScale;
      const top = position[1] + distToVertEdgeDivScale;
      return { left, right, bottom, top };
    }
    function posMod(a, b) {
      return a - Math.floor(a / b) * b;
    }
    function areCoordsIntegers(coords) {
      return Number.isInteger(coords[0]) && Number.isInteger(coords[1]);
    }
    function areLinesCollinear(lines) {
      let gradient;
      for (const line of lines) {
        const lgradient = line[1] / line[0];
        if (!gradient) gradient = lgradient;
        if (!Number.isFinite(gradient) && !Number.isFinite(lgradient)) {
          continue;
        }
        ;
        if (!isAproxEqual(lgradient, gradient)) return false;
      }
      return true;
    }
    function deepCopyObject(src) {
      if (typeof src !== "object" || src === null) return src;
      const copy = Array.isArray(src) ? [] : {};
      for (const key in src) {
        const value = src[key];
        copy[key] = deepCopyObject(value);
      }
      return copy;
    }
    function copyFloat32Array(src) {
      if (!src || !(src instanceof Float32Array)) {
        throw new Error("Invalid input: must be a Float32Array");
      }
      const copy = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) {
        copy[i] = src[i];
      }
      return copy;
    }
    function getKeyFromCoords(coords) {
      return `${coords[0]},${coords[1]}`;
    }
    function getCoordsFromKey(key) {
      return key.split(",").map(Number);
    }
    function isOrthogonalDistanceGreaterThanValue(point1, point2, value) {
      const xDiff = Math.abs(point2[0] - point1[0]);
      const yDiff = Math.abs(point2[1] - point1[1]);
      if (xDiff > value || yDiff > value) return true;
      return false;
    }
    function getBaseLog10(value) {
      return Math.log(value) / Math.log(10);
    }
    function convertWorldSpaceToCoords(worldCoords) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const xCoord = worldCoords[0] / boardScale + boardPos[0];
      const yCoord = worldCoords[1] / boardScale + boardPos[1];
      return [xCoord, yCoord];
    }
    function convertWorldSpaceToCoords_Rounded(worldCoords) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      const xCoord = worldCoords[0] / boardScale + boardPos[0];
      const yCoord = worldCoords[1] / boardScale + boardPos[1];
      const squareCenter = board2.gsquareCenter();
      return [Math.floor(xCoord + squareCenter), Math.floor(yCoord + squareCenter)];
    }
    function convertCoordToWorldSpace(coords, position = movement.getBoardPos(), scale = movement.getBoardScale()) {
      const worldX = (coords[0] - position[0] + 0.5 - board2.gsquareCenter()) * scale;
      const worldY = (coords[1] - position[1] + 0.5 - board2.gsquareCenter()) * scale;
      return [worldX, worldY];
    }
    function convertCoordToWorldSpace_ClampEdge(coords) {
      const boardPos = movement.getBoardPos();
      const boardScale = movement.getBoardScale();
      let worldX = (coords[0] - boardPos[0] + 0.5 - board2.gsquareCenter()) * boardScale;
      let worldY = (coords[1] - boardPos[1] + 0.5 - board2.gsquareCenter()) * boardScale;
      const inPerspective = perspective2.getEnabled();
      const a = perspective2.distToRenderBoard;
      const boundingBox = inPerspective ? { left: -a, right: a, bottom: -a, top: a } : camera2.getScreenBoundingBox(false);
      if (worldX < boundingBox.left) worldX = inPerspective ? -perspective2.distToRenderBoard : camera2.getScreenBoundingBox(false).left;
      else if (worldX > boundingBox.right) worldX = inPerspective ? perspective2.distToRenderBoard : camera2.getScreenBoundingBox(false).right;
      if (worldY < boundingBox.bottom) worldY = inPerspective ? -perspective2.distToRenderBoard : camera2.getScreenBoundingBox(false).bottom;
      else if (worldY > boundingBox.top) worldY = inPerspective ? perspective2.distToRenderBoard : camera2.getScreenBoundingBox(false).top;
      return [worldX, worldY];
    }
    function clamp(min, max, value) {
      if (min > value) return min;
      if (max < value) return max;
      return value;
    }
    function closestPointOnLine(lineStart, lineEnd, point) {
      let closestPoint;
      const dx = lineEnd[0] - lineStart[0];
      const dy = lineEnd[1] - lineStart[1];
      if (dx === 0) {
        closestPoint = [lineStart[0], clamp(lineStart[1], lineEnd[1], point[1])];
      } else {
        const m = dy / dx;
        const b = lineStart[1] - m * lineStart[0];
        let x = (m * (point[1] - b) + point[0]) / (m * m + 1);
        x = clamp(lineStart[0], lineEnd[0], x);
        const y = m * x + b;
        closestPoint = [x, y];
      }
      return {
        coords: closestPoint,
        distance: euclideanDistance(closestPoint, point)
      };
    }
    function convertPixelsToWorldSpace_Virtual(value) {
      return value / camera2.getCanvasHeightVirtualPixels() * (camera2.getScreenBoundingBox(false).top - camera2.getScreenBoundingBox(false).bottom);
    }
    function convertWorldSpaceToPixels_Virtual(value) {
      return value / (camera2.getScreenBoundingBox(false).top - camera2.getScreenBoundingBox(false).bottom) * camera2.getCanvasHeightVirtualPixels();
    }
    function getAABBCornerOfLine(line, negateSide) {
      let corner = "";
      v: {
        if (line[1] === 0) break v;
        corner += line[0] > 0 === line[1] > 0 === negateSide === (line[0] !== 0) ? "bottom" : "top";
      }
      h: {
        if (line[0] === 0) break h;
        corner += negateSide ? "left" : "right";
      }
      return corner;
    }
    function getCornerOfBoundingBox(boundingBox, corner) {
      const { left, right, top, bottom } = boundingBox;
      const yval = corner.startsWith("bottom") ? bottom : top;
      const xval = corner.endsWith("right") ? right : left;
      return [xval, yval];
    }
    function getLineIntersectionEntryTile(dx, dy, c, boundingBox, corner) {
      const { left, right, top, bottom } = boundingBox;
      if (corner.endsWith("left")) {
        const yIntersectLeft = (left * dy + c) / dx;
        if (yIntersectLeft >= bottom && yIntersectLeft <= top) return [left, yIntersectLeft];
      }
      if (corner.startsWith("bottom")) {
        const xIntersectBottom = (bottom * dx - c) / dy;
        if (xIntersectBottom >= left && xIntersectBottom <= right) return [xIntersectBottom, bottom];
      }
      if (corner.endsWith("right")) {
        const yIntersectRight = (right * dy + c) / dx;
        if (yIntersectRight >= bottom && yIntersectRight <= top) return [right, yIntersectRight];
      }
      if (corner.startsWith("top")) {
        const xIntersectTop = (top * dx - c) / dy;
        if (xIntersectTop >= left && xIntersectTop <= right) return [xIntersectTop, top];
      }
    }
    function getLineSteps(step, startCoord, endCoord) {
      const chebyshevDist = chebyshevDistance(startCoord, endCoord);
      const stepChebyshev = Math.max(step[0], step[1]);
      return Math.floor(chebyshevDist / stepChebyshev);
    }
    function convertWorldSpaceToGrid(value) {
      return value / movement.getBoardScale();
    }
    function euclideanDistance(point1, point2) {
      const xDiff = point2[0] - point1[0];
      const yDiff = point2[1] - point1[1];
      return Math.hypot(xDiff, yDiff);
    }
    function manhattanDistance(point1, point2) {
      return Math.abs(point1[0] - point2[0]) + Math.abs(point1[1] - point2[1]);
    }
    function chebyshevDistance(point1, point2) {
      const xDistance = Math.abs(point1[0] - point2[0]);
      const yDistance = Math.abs(point1[1] - point2[1]);
      return Math.max(xDistance, yDistance);
    }
    function toRadians(angleDegrees) {
      return angleDegrees * (Math.PI / 180);
    }
    function generatePerspectiveBoundingBox(rangeOfView) {
      const coords = movement.getBoardPos();
      const renderDistInSquares = rangeOfView / movement.getBoardScale();
      return {
        left: coords[0] - renderDistInSquares,
        right: coords[0] + renderDistInSquares,
        bottom: coords[1] - renderDistInSquares,
        top: coords[1] + renderDistInSquares
      };
    }
    function areCoordsEqual(coord1, coord2) {
      if (!coord1 || !coord2) return false;
      return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }
    function areCoordsEqual_noValidate(coord1, coord2) {
      return coord1[0] === coord2[0] && coord1[1] === coord2[1];
    }
    function binarySearch_findSplitPoint(sortedArray, value) {
      if (value == null) throw new Error(`Cannot binary search when value is null! ${value}`);
      let left = 0;
      let right = sortedArray.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midValue = sortedArray[mid];
        if (value < midValue) right = mid - 1;
        else if (value > midValue) left = mid + 1;
        else if (midValue === value) {
          throw new `Cannot find split point of sortedArray when it already contains the value! ${value}. List: ${JSON.stringify(sortedArray)}`();
        }
      }
      return left;
    }
    function binarySearch_findValue(sortedArray, value) {
      if (value == null) return console.error(`Cannot binary search when value is null! ${value}`);
      let left = 0;
      let right = sortedArray.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midValue = sortedArray[mid];
        if (value < midValue) right = mid - 1;
        else if (value > midValue) left = mid + 1;
        else if (midValue === value) return mid;
      }
      return left;
    }
    function deleteValueFromOrganizedArray(sortedArray, value) {
      let left = 0;
      let right = sortedArray.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midValue = sortedArray[mid];
        if (value === midValue) {
          sortedArray.splice(mid, 1);
          return mid;
        } else if (value < midValue) {
          right = mid - 1;
        } else if (value > midValue) {
          left = mid + 1;
        }
      }
    }
    function copyCoords(coords) {
      return [coords[0], coords[1]];
    }
    function roundAwayFromZero(value) {
      return value > 0 ? Math.ceil(value) : Math.floor(value);
    }
    function getPieceColorFromType(type) {
      if (type.endsWith("W")) return "white";
      else if (type.endsWith("B")) return "black";
      else if (type.endsWith("N")) return "neutral";
      else throw new Error(`Cannot get the color of piece with type ${type}`);
    }
    function getColorFromWorB(WorB) {
      if (WorB === "W") return "white";
      else if (WorB === "B") return "black";
      else if (WorB === "N") return "neutral";
      throw new Error(`Cannot return color when WorB is not W, B, or N! Received: "${WorB}"`);
    }
    function getOppositeColor(color) {
      if (color === "white") return "black";
      else if (color === "black") return "white";
      else throw new Error(`Cannot return the opposite color of color ${color}!`);
    }
    function getWorBFromType(type) {
      return type.charAt(type.length - 1);
    }
    function getWorBFromColor(color) {
      if (color === "white") return "W";
      else if (color === "black") return "B";
      else if (color === "neutral") return "N";
      else throw new Error(`Cannot return WorB from strange color ${color}!`);
    }
    function trimWorBFromType(type) {
      return type.slice(0, -1);
    }
    function isFloat32Array(param) {
      return param instanceof Float32Array;
    }
    function PseudoRandomGenerator(seed) {
      const a = 16807;
      const c = 2491057;
      const b = 8388607;
      let previous = seed;
      this.nextInt = function() {
        const next = (previous * a + c) % b;
        previous = next;
        return next;
      };
      this.nextFloat = function() {
        const next = (previous * a + c) % b;
        previous = next;
        return next / b;
      };
    }
    function decimalToPercent(decimal) {
      const percent = Math.round(decimal * 100);
      return percent.toString() + "%";
    }
    function copyPropertiesToObject(objSrc, objDest) {
      const objSrcKeys = Object.keys(objSrc);
      for (let i = 0; i < objSrcKeys.length; i++) {
        const key = objSrcKeys[i];
        objDest[key] = objSrc[key];
      }
    }
    function isEmpty(obj) {
      for (const prop in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, prop)) {
          return false;
        }
      }
      return true;
    }
    function isJson(str) {
      try {
        JSON.parse(str);
      } catch {
        return false;
      }
      return true;
    }
    function invertObj(obj) {
      const inv = {};
      for (const key in obj) {
        inv[obj[key]] = key;
      }
      return inv;
    }
    function generateID(length) {
      let result = "";
      const characters = "0123456789abcdefghijklmnopqrstuvwxyz";
      const charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.random() * charactersLength);
      }
      return result;
    }
    function genUniqueID(length, object) {
      let id;
      do {
        id = generateID(length);
      } while (object[id] != null);
      return id;
    }
    function generateNumbID(length) {
      const zeroOne = Math.random();
      const multiplier = 10 ** length;
      return Math.floor(zeroOne * multiplier);
    }
    function removeObjectFromArray(array, object) {
      const index = array.indexOf(object);
      if (index !== -1) array.splice(index, 1);
      else throw new Error(`Could not delete object from array, not found! Array: ${JSON.stringify(array)}. Object: ${object}`);
    }
    function minutesToMillis(minutes) {
      return minutes * 60 * 1e3;
    }
    function secondsToMillis(seconds) {
      return seconds * 1e3;
    }
    function getCurrentUTCDate() {
      const now = /* @__PURE__ */ new Date();
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const day = String(now.getUTCDate()).padStart(2, "0");
      return `${year}.${month}.${day}`;
    }
    function getCurrentUTCTime() {
      const now = /* @__PURE__ */ new Date();
      const hours = String(now.getUTCHours()).padStart(2, "0");
      const minutes = String(now.getUTCMinutes()).padStart(2, "0");
      const seconds = String(now.getUTCSeconds()).padStart(2, "0");
      return `${hours}:${minutes}:${seconds}`;
    }
    function convertTimestampToUTCDateUTCTime(timestamp) {
      const date = new Date(timestamp);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");
      const UTCDate = `${year}.${month}.${day}`;
      const UTCTime = `${hours}:${minutes}:${seconds}`;
      return { UTCDate, UTCTime };
    }
    function convertUTCDateUTCTimeToTimeStamp(UTCDate, UTCTime = "00:00:00") {
      const [year, month, day] = UTCDate.split(".").map(Number);
      const [hours, minutes, seconds] = UTCTime.split(":").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
      return date.getTime();
    }
    function getTotalMilliseconds(options3) {
      const millisecondsIn = {
        milliseconds: 1,
        seconds: 1e3,
        minutes: 1e3 * 60,
        hours: 1e3 * 60 * 60,
        days: 1e3 * 60 * 60 * 24,
        weeks: 1e3 * 60 * 60 * 24 * 7,
        months: 1e3 * 60 * 60 * 24 * 30,
        // Approximation, not precise
        years: 1e3 * 60 * 60 * 24 * 365
        // Approximation, not precise
      };
      let totalMilliseconds = 0;
      for (const option in options3) {
        if (millisecondsIn[option]) totalMilliseconds += options3[option] * millisecondsIn[option];
      }
      return totalMilliseconds;
    }
    function GCD(a, b) {
      if (b === 0) {
        return a;
      } else {
        return GCD(b, a % b);
      }
    }
    function LCM(arr) {
      let ans = arr[0];
      for (let i = 1; i < arr.length; i++)
        ans = arr[i] * ans / GCD(arr[i], ans);
      return ans;
    }
    return Object.freeze({
      isPowerOfTwo,
      isAproxEqual,
      getLineIntersection,
      getXYComponents_FromAngle,
      removeObjectFromArray,
      roundPointToNearestGridpoint,
      boxContainsBox,
      boxContainsSquare,
      posMod,
      areCoordsIntegers,
      areLinesCollinear,
      deepCopyObject,
      getKeyFromCoords,
      getCoordsFromKey,
      isOrthogonalDistanceGreaterThanValue,
      getBaseLog10,
      convertWorldSpaceToCoords,
      convertWorldSpaceToCoords_Rounded,
      convertCoordToWorldSpace,
      convertCoordToWorldSpace_ClampEdge,
      clamp,
      closestPointOnLine,
      getBoundingBoxOfBoard,
      convertPixelsToWorldSpace_Virtual,
      convertWorldSpaceToPixels_Virtual,
      getAABBCornerOfLine,
      getCornerOfBoundingBox,
      getLineIntersectionEntryTile,
      getLineSteps,
      convertWorldSpaceToGrid,
      euclideanDistance,
      manhattanDistance,
      chebyshevDistance,
      generateID,
      generateNumbID,
      toRadians,
      generatePerspectiveBoundingBox,
      areCoordsEqual,
      areCoordsEqual_noValidate,
      binarySearch_findSplitPoint,
      binarySearch_findValue,
      deleteValueFromOrganizedArray,
      copyCoords,
      roundAwayFromZero,
      getPieceColorFromType,
      getColorFromWorB,
      getOppositeColor,
      getWorBFromType,
      getWorBFromColor,
      trimWorBFromType,
      isFloat32Array,
      PseudoRandomGenerator,
      decimalToPercent,
      copyPropertiesToObject,
      copyFloat32Array,
      mergeBoundingBoxes,
      getBoxFromCoordsList,
      expandBoxToContainSquare,
      isEmpty,
      isJson,
      invertObj,
      minutesToMillis,
      secondsToMillis,
      getTotalMilliseconds,
      genUniqueID,
      GCD,
      LCM,
      getCurrentUTCDate,
      getCurrentUTCTime,
      convertTimestampToUTCDateUTCTime,
      convertUTCDateUTCTimeToTimeStamp
    });
  }();

  // src/client/scripts/game/chess/insufficientmaterial.mjs
  var insufficientmaterial = function() {
    const insuffmatScenarios_1K1k = [
      { "queensW": 1 },
      { "bishopsW": [Infinity, 1] },
      { "knightsW": 3 },
      { "hawksW": 2 },
      { "rooksW": 1, "knightsW": 1 },
      { "rooksW": 1, "bishopsW": [1, 0] },
      { "archbishopsW": 1, "bishopsW": [1, 0] },
      { "archbishopsW": 1, "knightsW": 1 },
      { "knightsW": 1, "bishopsW": [Infinity, 0] },
      { "knightsW": 1, "bishopsW": [1, 1] },
      { "knightsW": 2, "bishopsW": [1, 0] },
      { "guardsW": 1 },
      { "chancellorsW": 1 },
      { "knightridersW": 2 },
      { "pawnsW": 3 }
    ];
    const insuffmatScenarios_0K1k = [
      { "queensW": 1, "rooksW": 1 },
      { "queensW": 1, "knightsW": 1 },
      { "queensW": 1, "bishopsW": [1, 0] },
      { "queensW": 1, "pawnsW": 1 },
      { "bishopsW": [2, 2] },
      { "bishopsW": [Infinity, 1] },
      { "knightsW": 4 },
      { "knightsW": 2, "bishopsW": [Infinity, 0] },
      { "knightsW": 2, "bishopsW": [1, 1] },
      { "knightsW": 1, "bishopsW": [2, 1] },
      { "hawksW": 3 },
      { "rooksW": 1, "knightsW": 1, "bishopsW": [1, 0] },
      { "rooksW": 1, "knightsW": 1, "pawnsW": 1 },
      { "rooksW": 1, "knightsW": 2 },
      { "rooksW": 1, "guardsW": 1 },
      { "rooksW": 2, "bishopsW": [1, 0] },
      { "rooksW": 2, "knightsW": 1 },
      { "rooksW": 2, "pawnsW": 1 },
      { "archbishopsW": 1, "bishopsW": [2, 0] },
      { "archbishopsW": 1, "bishopsW": [1, 1] },
      { "archbishopsW": 1, "knightsW": 2 },
      { "archbishopsW": 2 },
      { "chancellorsW": 1, "guardsW": 1 },
      { "chancellorsW": 1, "knightsW": 1 },
      { "chancellorsW": 1, "rooksW": 1 },
      { "guardsW": 2 },
      { "amazonsW": 1 },
      { "knightridersW": 3 },
      { "pawnsW": 6 }
    ];
    const insuffmatScenarios_special = [
      { "kingsB": Infinity, "kingsW": Infinity },
      { "royalCentaursB": Infinity, "royalCentaursW": Infinity },
      { "royalCentaursB": 1, "amazonsW": 1 }
    ];
    function isScenarioInsuffMat(scenario) {
      let scenrariosForInsuffMat;
      if (scenario["kingsB"] === 1) {
        if (scenario["kingsW"] === 1) {
          scenrariosForInsuffMat = insuffmatScenarios_1K1k;
          delete scenario["kingsW"];
          delete scenario["kingsB"];
        } else if (!scenario["kingsW"]) {
          scenrariosForInsuffMat = insuffmatScenarios_0K1k;
          delete scenario["kingsB"];
        } else {
          scenrariosForInsuffMat = insuffmatScenarios_special;
        }
      } else {
        scenrariosForInsuffMat = insuffmatScenarios_special;
      }
      drawscenarioloop:
        for (const drawScenario of scenrariosForInsuffMat) {
          for (const piece in scenario) {
            if (!(piece in drawScenario) || has_more_pieces(scenario[piece], drawScenario[piece])) continue drawscenarioloop;
          }
          return true;
        }
      return false;
    }
    function has_more_pieces(a, b) {
      if (typeof a === "number") return a > b;
      else return a[0] > b[0] || a[1] > b[1];
    }
    function sum_tuple_coords(tuple) {
      return tuple[0] + tuple[1];
    }
    function ordered_tuple_descending(tuple) {
      if (tuple[0] < tuple[1]) return [tuple[1], tuple[0]];
      else return tuple;
    }
    function detectInsufficientMaterial(gamefile2) {
      if (!wincondition2.doesColorHaveWinCondition(gamefile2, "white", "checkmate") || !wincondition2.doesColorHaveWinCondition(gamefile2, "black", "checkmate")) return false;
      if (wincondition2.getWinConditionCountOfColor(gamefile2, "white") != 1 || wincondition2.getWinConditionCountOfColor(gamefile2, "black") != 1) return false;
      const lastMove = movesscript2.getLastMove(gamefile2.moves);
      if (lastMove && !lastMove.captured) return false;
      if (gamefileutility2.getPieceCountOfGame(gamefile2, { ignoreVoids: false, ignoreObstacles: true }) >= 11) return false;
      const scenario = {};
      const bishopsW_count = [0, 0];
      const bishopsB_count = [0, 0];
      for (const key in gamefile2.piecesOrganizedByKey) {
        const piece = gamefile2.piecesOrganizedByKey[key];
        if (piece === "obstaclesN") continue;
        else if (math2.trimWorBFromType(piece) === "bishops") {
          const parity = sum_tuple_coords(math2.getCoordsFromKey(key)) % 2;
          const color = math2.getWorBFromType(piece);
          if (color === "W") bishopsW_count[parity] += 1;
          else if (color === "B") bishopsB_count[parity] += 1;
        } else if (piece in scenario) scenario[piece] += 1;
        else scenario[piece] = 1;
      }
      if (sum_tuple_coords(bishopsW_count) != 0) scenario["bishopsW"] = ordered_tuple_descending(bishopsW_count);
      if (sum_tuple_coords(bishopsB_count) != 0) scenario["bishopsB"] = ordered_tuple_descending(bishopsB_count);
      if (gamefile2.gameRules.promotionRanks) {
        const promotionListWhite = gamefile2.gameRules.promotionsAllowed.white;
        const promotionListBlack = gamefile2.gameRules.promotionsAllowed.black;
        if ("pawnsW" in scenario && promotionListWhite.length != 0) return false;
        if ("pawnsB" in scenario && promotionListBlack.length != 0) return false;
      }
      const invertedScenario = {};
      for (const piece in scenario) {
        const pieceInverted = piece.endsWith("W") ? piece.replace(/W$/, "B") : piece.replace(/B$/, "W");
        invertedScenario[pieceInverted] = scenario[piece];
      }
      if (isScenarioInsuffMat(scenario)) return "draw insuffmat";
      else if (isScenarioInsuffMat(invertedScenario)) return "draw insuffmat";
      else return false;
    }
    return Object.freeze({
      detectInsufficientMaterial
    });
  }();

  // src/client/scripts/game/chess/checkmate.mjs
  var checkmate = function() {
    function detectCheckmateOrDraw(gamefile2) {
      if (detectRepetitionDraw(gamefile2)) return "draw repetition";
      const whosTurn = gamefile2.whosTurn;
      const teamTypes = pieces[whosTurn];
      for (const thisType of teamTypes) {
        const thesePieces = gamefile2.ourPieces[thisType];
        for (let a = 0; a < thesePieces.length; a++) {
          const coords = thesePieces[a];
          if (!coords) continue;
          const index = gamefileutility2.getPieceIndexByTypeAndCoords(gamefile2, thisType, coords);
          const thisPiece = { type: thisType, coords, index };
          const moves = legalmoves.calculate(gamefile2, thisPiece);
          if (!legalmoves.hasAtleast1Move(moves)) continue;
          return false;
        }
      }
      const usingCheckmate = wincondition2.isOpponentUsingWinCondition(gamefile2, "checkmate");
      if (gamefile2.inCheck && usingCheckmate) {
        const colorThatWon = movesscript.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1);
        return `${colorThatWon} checkmate`;
      } else return "draw stalemate";
    }
    function detectRepetitionDraw(gamefile2) {
      const moveList = gamefile2.moves;
      const deficit = {};
      const surplus = {};
      let equalPositionsFound = 0;
      let index = moveList.length - 1;
      let indexOfLastEqualPositionFound = index + 1;
      while (index >= 0) {
        const thisMove = moveList[index];
        if (thisMove.captured || thisMove.type.startsWith("pawns")) break;
        const endCoords = thisMove.endCoords;
        let key = `${endCoords[0]},${endCoords[1]},${thisMove.type}`;
        if (surplus[key]) delete surplus[key];
        else deficit[key] = true;
        const startCoords = thisMove.startCoords;
        key = `${startCoords[0]},${startCoords[1]},${thisMove.type}`;
        if (deficit[key]) delete deficit[key];
        else surplus[key] = true;
        checkEqualPosition: {
          const indexDiff = indexOfLastEqualPositionFound - index;
          if (indexDiff < gamefile2.gameRules.turnOrder.length) break checkEqualPosition;
          const deficitKeys = Object.keys(deficit);
          const surplusKeys = Object.keys(surplus);
          if (deficitKeys.length === 0 && surplusKeys.length === 0) {
            equalPositionsFound++;
            indexOfLastEqualPositionFound = index;
            if (equalPositionsFound === 2) break;
          }
        }
        index--;
      }
      return equalPositionsFound === 2;
    }
    return Object.freeze({
      detectCheckmateOrDraw
    });
  }();

  // src/client/scripts/game/chess/wincondition.mjs
  var wincondition2 = function() {
    const validWinConditions = ["checkmate", "royalcapture", "allroyalscaptured", "allpiecescaptured", "threecheck", "koth"];
    const decisiveGameConclusions = [...validWinConditions, "stalemate", "repetition", "moverule", "insuffmat"];
    const kothCenterSquares = [[4, 4], [5, 4], [4, 5], [5, 5]];
    function getGameConclusion(gamefile2) {
      return detectAllpiecescaptured(gamefile2) || detectRoyalCapture(gamefile2) || detectAllroyalscaptured(gamefile2) || detectThreecheck(gamefile2) || detectKoth(gamefile2) || checkmate.detectCheckmateOrDraw(gamefile2) || detectMoveRule(gamefile2) || insufficientmaterial.detectInsufficientMaterial(gamefile2) || false;
    }
    function detectRoyalCapture(gamefile2) {
      if (!isOpponentUsingWinCondition(gamefile2, "royalcapture")) return false;
      if (wasLastMoveARoyalCapture(gamefile2)) {
        const colorThatWon = movesscript2.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1);
        return `${colorThatWon} royalcapture`;
      }
      return false;
    }
    function detectAllroyalscaptured(gamefile2) {
      if (!isOpponentUsingWinCondition(gamefile2, "allroyalscaptured")) return false;
      if (!wasLastMoveARoyalCapture(gamefile2)) return false;
      const royalCount = gamefileutility2.getCountOfTypesFromPiecesByType(gamefile2.ourPieces, pieces.royals, gamefile2.whosTurn);
      if (royalCount === 0) {
        const colorThatWon = movesscript2.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1);
        return `${colorThatWon} allroyalscaptured`;
      }
      return false;
    }
    function detectAllpiecescaptured(gamefile2) {
      if (!isOpponentUsingWinCondition(gamefile2, "allpiecescaptured")) return false;
      const count = gamefileutility2.getPieceCountOfColorFromPiecesByType(gamefile2.ourPieces, gamefile2.whosTurn);
      if (count === 0) {
        const colorThatWon = movesscript2.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1);
        return `${colorThatWon} allpiecescaptured`;
      }
      return false;
    }
    function detectThreecheck(gamefile2) {
      if (!isOpponentUsingWinCondition(gamefile2, "threecheck")) return false;
      if (gamefile2.inCheck) {
        if (gamefile2.checksGiven == null) gamefile2.checksGiven = { white: 0, black: 0 };
        if (gamefile2.whosTurn === "white") gamefile2.checksGiven.white++;
        else if (gamefile2.whosTurn === "black") gamefile2.checksGiven.black++;
        else throw new Error(`Whosturn is invalid when detecting threecheck! Value ${gamefile2.whosTurn}`);
        if (gamefile2.checksGiven[gamefile2.whosTurn] === 3) {
          if (gamefile2.whosTurn === "white") return "black threecheck";
          else if (gamefile2.whosTurn === "black") return "white threecheck";
          else throw new Error("Cannot determine winning color by wincondition threecheck!");
        }
      }
      return false;
    }
    function detectKoth(gamefile2) {
      if (!isOpponentUsingWinCondition(gamefile2, "koth")) return false;
      const lastMove = movesscript2.getLastMove(gamefile2.moves);
      if (!lastMove) return false;
      if (!lastMove.type.startsWith("kings")) return false;
      let kingInCenter = false;
      for (let i = 0; i < kothCenterSquares.length; i++) {
        const thisCenterSquare = kothCenterSquares[i];
        const typeAtSquare = gamefileutility2.getPieceTypeAtCoords(gamefile2, thisCenterSquare);
        if (!typeAtSquare) continue;
        if (typeAtSquare.startsWith("kings")) {
          kingInCenter = true;
          break;
        }
      }
      if (kingInCenter) {
        const colorThatWon = movesscript2.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1);
        return `${colorThatWon} koth`;
      }
      return false;
    }
    function detectMoveRule(gamefile2) {
      if (!gamefile2.gameRules.moveRule) return false;
      if (gamefile2.moveRuleState === gamefile2.gameRules.moveRule) return "draw moverule";
      return false;
    }
    function isOpponentUsingWinCondition(gamefile2, winCondition) {
      const oppositeColor = math2.getOppositeColor(gamefile2.whosTurn);
      return gamefile2.gameRules.winConditions[oppositeColor].includes(winCondition);
    }
    function doesColorHaveWinCondition(gamefile2, color, winCondition) {
      return gamefile2.gameRules.winConditions[color].includes(winCondition);
    }
    function getWinConditionCountOfColor(gamefile2, color) {
      if (gamefile2.gameRules.winConditions[color] == null) return 0;
      return gamefile2.gameRules.winConditions[color].length;
    }
    function wasLastMoveARoyalCapture(gamefile2) {
      const lastMove = movesscript2.getLastMove(gamefile2.moves);
      if (!lastMove) return false;
      if (!lastMove.captured) return false;
      const trimmedTypeCaptured = math2.trimWorBFromType(lastMove.captured);
      return pieces.royals.includes(trimmedTypeCaptured);
    }
    function isGameConclusionDecisive(gameConclusion) {
      if (gameConclusion === false) throw new Error("Should not be checking if gameConclusion is decisive when game isn't over.");
      for (const conclusion of decisiveGameConclusions) {
        if (gameConclusion.includes(conclusion)) return true;
      }
      return false;
    }
    function getVictorAndConditionFromGameConclusion(gameConclusion) {
      let [victor, condition] = gameConclusion.split(" ");
      if (victor === "aborted") {
        condition = victor;
        victor = void 0;
      }
      return { victor, condition };
    }
    function getResultFromVictor(victor) {
      if (victor === "white") return "1-0";
      else if (victor === "black") return "0-1";
      else if (victor === "draw") return "0.5-0.5";
      else if (victor === "aborted") return "0-0";
      throw new Error(`Cannot get game result from strange victor "${victor}"!`);
    }
    function isCheckmateCompatibleWithGame(gamefile2) {
      if (gamefile2.startSnapshot.pieceCount >= gamefileutility2.pieceCountToDisableCheckmate) return false;
      if (organizedlines.areColinearSlidesPresentInGame(gamefile2)) return false;
      if (gamefile2.startSnapshot.playerCount > 2) return false;
      if (movesscript2.doesAnyPlayerGet2TurnsInARow(gamefile2)) return false;
      return true;
    }
    function swapCheckmateForRoyalCapture(gamefile2) {
      if (doesColorHaveWinCondition(gamefile2, "white", "checkmate")) {
        math2.removeObjectFromArray(gamefile2.gameRules.winConditions.white, "checkmate");
        gamefile2.gameRules.winConditions.white.push("royalcapture");
      }
      if (doesColorHaveWinCondition(gamefile2, "black", "checkmate")) {
        math2.removeObjectFromArray(gamefile2.gameRules.winConditions.black, "checkmate");
        gamefile2.gameRules.winConditions.black.push("royalcapture");
      }
      console.log("Swapped checkmate wincondition for royalcapture.");
    }
    function getTerminationInEnglish(gamefile2, condition) {
      switch (condition) {
        case "checkmate":
          return translations.termination.checkmate;
        case "stalemate":
          return translations.termination.stalemate;
        case "repetition":
          return translations.termination.repetition;
        case "moverule": {
          const numbWholeMovesUntilAutoDraw = gamefile2.gameRules.moveRule / 2;
          return `${translations.termination.moverule[0]}${numbWholeMovesUntilAutoDraw}${translations.termination.moverule[1]}`;
        }
        case "insuffmat":
          return translations.termination.insuffmat;
        case "royalcapture":
          return translations.termination.royalcapture;
        case "allroyalscaptured":
          return translations.termination.allroyalscaptured;
        case "allpiecescaptured":
          return translations.termination.allpiecescaptured;
        case "threecheck":
          return translations.termination.threecheck;
        case "koth":
          return translations.termination.koth;
        // Non-decisive "decisive" conclusions
        case "resignation":
          return translations.termination.resignation;
        case "time":
          return translations.termination.time;
        case "aborted":
          return translations.termination.aborted;
        case "disconnect":
          return translations.termination.disconnect;
        case "agreement":
          return translations.termination.agreement;
        default:
          console.error(`Cannot return English termination for unknown condition "${condition}"!`);
          return "Unknown";
      }
    }
    return Object.freeze({
      validWinConditions,
      getGameConclusion,
      detectThreecheck,
      isOpponentUsingWinCondition,
      doesColorHaveWinCondition,
      getWinConditionCountOfColor,
      isGameConclusionDecisive,
      getVictorAndConditionFromGameConclusion,
      getResultFromVictor,
      isCheckmateCompatibleWithGame,
      swapCheckmateForRoyalCapture,
      getTerminationInEnglish
    });
  }();

  // src/client/scripts/game/gui/guigameinfo.mjs
  var guigameinfo = function() {
    const element_whosturn = document.getElementById("whosturn");
    const element_dot = document.getElementById("dot");
    const element_playerWhite = document.getElementById("playerwhite");
    const element_playerBlack = document.getElementById("playerblack");
    function open() {
      if (game2.getGamefile().gameConclusion) return;
      style.revealElement(element_dot);
    }
    function hidePlayerNames() {
      style.hideElement(element_playerWhite);
      style.hideElement(element_playerBlack);
    }
    function revealPlayerNames(gameOptions) {
      if (gameOptions) {
        const white = gameOptions.metadata.White;
        const black = gameOptions.metadata.Black;
        element_playerWhite.textContent = onlinegame2.areWeColor("white") && white === translations["guest_indicator"] ? translations["you_indicator"] : white;
        element_playerBlack.textContent = onlinegame2.areWeColor("black") && black === translations["guest_indicator"] ? translations["you_indicator"] : black;
      }
      style.revealElement(element_playerWhite);
      style.revealElement(element_playerBlack);
    }
    function updateWhosTurn(gamefile2) {
      const color = gamefile2.whosTurn;
      if (color !== "white" && color !== "black")
        throw new Error(`Cannot set the document element text showing whos turn it is when color is neither white nor black! ${color}`);
      let textContent = "";
      if (onlinegame2.areInOnlineGame()) {
        const ourTurn = onlinegame2.isItOurTurn(gamefile2);
        textContent = ourTurn ? translations["your_move"] : translations["their_move"];
      } else textContent = color === "white" ? translations["white_to_move"] : translations["black_to_move"];
      element_whosturn.textContent = textContent;
      style.revealElement(element_dot);
      if (color === "white") {
        element_dot.classList.remove("dotblack");
        element_dot.classList.add("dotwhite");
      } else {
        element_dot.classList.remove("dotwhite");
        element_dot.classList.add("dotblack");
      }
    }
    function gameEnd(conclusion) {
      const { victor, condition } = wincondition2.getVictorAndConditionFromGameConclusion(conclusion);
      const resultTranslations = translations["results"];
      style.hideElement(element_dot);
      if (onlinegame2.areInOnlineGame()) {
        if (onlinegame2.areWeColor(victor)) element_whosturn.textContent = condition === "checkmate" ? resultTranslations["you_checkmate"] : condition === "time" ? resultTranslations["you_time"] : condition === "resignation" ? resultTranslations["you_resignation"] : condition === "disconnect" ? resultTranslations["you_disconnect"] : condition === "royalcapture" ? resultTranslations["you_royalcapture"] : condition === "allroyalscaptured" ? resultTranslations["you_allroyalscaptured"] : condition === "allpiecescaptured" ? resultTranslations["you_allpiecescaptured"] : condition === "threecheck" ? resultTranslations["you_threecheck"] : condition === "koth" ? resultTranslations["you_koth"] : resultTranslations["you_generic"];
        else if (victor === "draw") element_whosturn.textContent = condition === "stalemate" ? resultTranslations["draw_stalemate"] : condition === "repetition" ? resultTranslations["draw_repetition"] : condition === "moverule" ? `${resultTranslations["draw_moverule"][0]}${game2.getGamefile().gameRules.moveRule / 2}${resultTranslations["draw_moverule"][1]}` : condition === "insuffmat" ? resultTranslations["draw_insuffmat"] : condition === "agreement" ? resultTranslations["draw_agreement"] : resultTranslations["draw_generic"];
        else if (condition === "aborted") element_whosturn.textContent = resultTranslations["aborted"];
        else element_whosturn.textContent = condition === "checkmate" ? resultTranslations["opponent_checkmate"] : condition === "time" ? resultTranslations["opponent_time"] : condition === "resignation" ? resultTranslations["opponent_resignation"] : condition === "disconnect" ? resultTranslations["opponent_disconnect"] : condition === "royalcapture" ? resultTranslations["opponent_royalcapture"] : condition === "allroyalscaptured" ? resultTranslations["opponent_allroyalscaptured"] : condition === "allpiecescaptured" ? resultTranslations["opponent_allpiecescaptured"] : condition === "threecheck" ? resultTranslations["opponent_threecheck"] : condition === "koth" ? resultTranslations["opponent_koth"] : resultTranslations["opponent_generic"];
      } else {
        if (condition === "checkmate") element_whosturn.textContent = victor === "white" ? resultTranslations["white_checkmate"] : victor === "black" ? resultTranslations["black_checkmate"] : resultTranslations["bug_checkmate"];
        else if (condition === "time") element_whosturn.textContent = victor === "white" ? resultTranslations["white_time"] : victor === "black" ? resultTranslations["black_time"] : resultTranslations["bug_time"];
        else if (condition === "royalcapture") element_whosturn.textContent = victor === "white" ? resultTranslations["white_royalcapture"] : victor === "black" ? resultTranslations["black_royalcapture"] : resultTranslations["bug_royalcapture"];
        else if (condition === "allroyalscaptured") element_whosturn.textContent = victor === "white" ? resultTranslations["white_allroyalscaptured"] : victor === "black" ? resultTranslations["black_allroyalscaptured"] : resultTranslations["bug_allroyalscaptured"];
        else if (condition === "allpiecescaptured") element_whosturn.textContent = victor === "white" ? resultTranslations["white_allpiecescaptured"] : victor === "black" ? resultTranslations["black_allpiecescaptured"] : resultTranslations["bug_allpiecescaptured"];
        else if (condition === "threecheck") element_whosturn.textContent = victor === "white" ? resultTranslations["white_threecheck"] : victor === "black" ? resultTranslations["black_threecheck"] : resultTranslations["bug_threecheck"];
        else if (condition === "koth") element_whosturn.textContent = victor === "white" ? resultTranslations["white_koth"] : victor === "black" ? resultTranslations["black_koth"] : resultTranslations["bug_koth"];
        else if (condition === "stalemate") element_whosturn.textContent = resultTranslations["draw_stalemate"];
        else if (condition === "repetition") element_whosturn.textContent = resultTranslations["draw_repetition"];
        else if (condition === "moverule") element_whosturn.textContent = `${resultTranslations["draw_moverule"][0]}${game2.getGamefile().gameRules.moveRule / 2}${resultTranslations["draw_moverule"][1]}`;
        else if (condition === "insuffmat") element_whosturn.textContent = resultTranslations["draw_insuffmat"];
        else {
          element_whosturn.textContent = resultTranslations["bug_generic"];
          console.error(`Game conclusion: "${conclusion}"
Victor: ${victor}
Condition: ${condition}`);
        }
      }
    }
    return Object.freeze({
      open,
      hidePlayerNames,
      revealPlayerNames,
      updateWhosTurn,
      gameEnd
    });
  }();

  // src/client/scripts/game/chess/gamefileutility.mjs
  var gamefileutility2 = function() {
    const pieceCountToDisableCheckmate = 5e4;
    function getPieceCountOfType(gamefile2, type) {
      const typeList = gamefile2.ourPieces[type];
      if (typeList == null) return 0;
      return typeList.length - typeList.undefineds.length;
    }
    function forEachPieceInGame(gamefile2, callback, ignoreVoids) {
      if (!gamefile2) return console.log("Cannot iterate through each piece in an undefined game!");
      if (!gamefile2.ourPieces) return console.error("Cannot iterate through every piece of game when there's no piece list.");
      forEachPieceInPiecesByType(callback, gamefile2.ourPieces, ignoreVoids, gamefile2);
    }
    function forEachPieceInPiecesByType(callback, typeList, ignoreVoids, gamefile2) {
      if (!typeList) return console.log("Cannot iterate through each piece in an undefined typeList!");
      for (let i = 0; i < pieces.white.length; i++) {
        const thisWhiteType = pieces.white[i];
        const thisBlackType = pieces.black[i];
        const theseWhitePieces = typeList[thisWhiteType];
        const theseBlackPieces = typeList[thisBlackType];
        if (theseWhitePieces) for (let a = 0; a < theseWhitePieces.length; a++) callback(thisWhiteType, theseWhitePieces[a], gamefile2);
        if (theseBlackPieces) for (let a = 0; a < theseBlackPieces.length; a++) callback(thisBlackType, theseBlackPieces[a], gamefile2);
      }
      for (let i = 0; i < pieces.neutral.length; i++) {
        const thisNeutralType = pieces.neutral[i];
        if (ignoreVoids && thisNeutralType.startsWith("voids")) continue;
        const theseNeutralPieces = typeList[thisNeutralType];
        if (theseNeutralPieces) for (let a = 0; a < theseNeutralPieces.length; a++) callback(thisNeutralType, theseNeutralPieces[a], gamefile2);
      }
    }
    function forEachPieceInKeysState(callback, state, { ignoreNeutrals, ignoreVoids } = {}) {
      if (!state) return console.log("Cannot iterate through each piece in an undefined keys-state!");
      if (ignoreNeutrals) {
        for (const key in state) {
          const thisPieceType = state[key];
          if (thisPieceType.endsWith("N")) continue;
          callback(thisPieceType, math2.getCoordsFromKey(key));
        }
      }
      if (ignoreVoids) {
        for (const key in state) {
          const thisPieceType = state[key];
          if (thisPieceType.startsWith("voids")) continue;
          callback(thisPieceType, math2.getCoordsFromKey(key));
        }
      } else {
        for (const key in state) {
          const thisPieceType = state[key];
          callback(thisPieceType, math2.getCoordsFromKey(key));
        }
      }
    }
    function deleteIndexFromPieceList(list, pieceIndex) {
      list[pieceIndex] = void 0;
      const insertIndex = math2.binarySearch_findSplitPoint(list.undefineds, pieceIndex);
      list.undefineds.splice(insertIndex, 0, pieceIndex);
    }
    function getPieceIndexByTypeAndCoords(gamefile2, type, coords) {
      const thesePieces = gamefile2.ourPieces[type];
      if (!thesePieces) return console.error("Cannot find piece index. Type array doesn't exist.");
      for (let i = 0; i < thesePieces.length; i++) {
        const thisPieceCoords = thesePieces[i];
        if (!thisPieceCoords) continue;
        if (math2.areCoordsEqual_noValidate(thisPieceCoords, coords)) return i;
      }
      console.error("Unable to find index of piece!");
    }
    function getPieceFromTypeAndCoords(gamefile2, type, coords) {
      const index = getPieceIndexByTypeAndCoords(gamefile2, type, coords);
      return { type, coords, index };
    }
    function getPieceTypeAtCoords(gamefile2, coords) {
      const key = math2.getKeyFromCoords(coords);
      return gamefile2.piecesOrganizedByKey[key];
    }
    function getPieceAtCoords(gamefile2, coords) {
      const type = getPieceTypeAtCoords(gamefile2, coords);
      if (!type) return void 0;
      const index = getPieceIndexByTypeAndCoords(gamefile2, type, coords);
      return { type, index, coords };
    }
    function updateGameConclusion(gamefile2, { concludeGameIfOver = true, simulated = false } = {}) {
      gamefile2.gameConclusion = wincondition2.getGameConclusion(gamefile2);
      if (!simulated && concludeGameIfOver && gamefile2.gameConclusion && !onlinegame2.areInOnlineGame()) concludeGame(gamefile2);
    }
    function concludeGame(gamefile2, conclusion = gamefile2.gameConclusion, { requestRemovalFromActiveGames = true } = {}) {
      gamefile2.gameConclusion = conclusion;
      if (requestRemovalFromActiveGames) onlinegame2.requestRemovalFromPlayersInActiveGames();
      if (wincondition2.isGameConclusionDecisive(gamefile2.gameConclusion)) movesscript2.flagLastMoveAsMate(gamefile2);
      clock.stop();
      board2.darkenColor();
      guigameinfo.gameEnd(gamefile2.gameConclusion);
      onlinegame2.onGameConclude();
      const delayToPlayConcludeSoundSecs = 0.65;
      if (!onlinegame2.areInOnlineGame()) {
        if (!gamefile2.gameConclusion.includes("draw")) sound.playSound_win(delayToPlayConcludeSoundSecs);
        else sound.playSound_draw(delayToPlayConcludeSoundSecs);
      } else {
        if (gamefile2.gameConclusion.includes(onlinegame2.getOurColor())) sound.playSound_win(delayToPlayConcludeSoundSecs);
        else if (gamefile2.gameConclusion.includes("draw") || gamefile2.gameConclusion.includes("aborted")) sound.playSound_draw(delayToPlayConcludeSoundSecs);
        else sound.playSound_loss(delayToPlayConcludeSoundSecs);
      }
      setTerminationMetadata(gamefile2);
      selection2.unselectPiece();
      guipause2.updateTextOfMainMenuButton();
    }
    function isGameOver(gamefile2 = game.getGamefile()) {
      if (gamefile2.gameConclusion) return true;
      return false;
    }
    function setTerminationMetadata(gamefile2) {
      if (!gamefile2.gameConclusion) return console.error("Cannot set conclusion metadata when game isn't over yet.");
      const victorAndCondition = wincondition2.getVictorAndConditionFromGameConclusion(gamefile2.gameConclusion);
      const condition = wincondition2.getTerminationInEnglish(gamefile2, victorAndCondition.condition);
      gamefile2.metadata.Termination = condition;
      const victor = victorAndCondition.victor;
      gamefile2.metadata.Result = victor === "white" ? "1-0" : victor === "black" ? "0-1" : victor === "draw" ? "1/2-1/2" : "0-0";
    }
    function getJumpingRoyalCoords(gamefile2, color) {
      const state = gamefile2.ourPieces;
      const jumpingRoyals = pieces.jumpingRoyals;
      const royalCoordsList = [];
      if (color === "white") {
        for (let i = 0; i < jumpingRoyals.length; i++) {
          const thisRoyalType = jumpingRoyals[i] + "W";
          if (!state[thisRoyalType]) return console.error(`Cannot fetch jumping royal coords when list ${thisRoyalType} is undefined!`);
          state[thisRoyalType].forEach((coords) => {
            if (!coords) return;
            royalCoordsList.push(coords);
          });
        }
      } else if (color === "black") {
        for (let i = 0; i < jumpingRoyals.length; i++) {
          const thisRoyalType = jumpingRoyals[i] + "B";
          if (!state[thisRoyalType]) return console.error(`Cannot fetch jumping royal coords when list ${thisRoyalType} is undefined!`);
          state[thisRoyalType].forEach((coords) => {
            if (!coords) return;
            royalCoordsList.push(coords);
          });
        }
      } else console.error(`Cannot get jumping royal coords from a side with color ${color}!`);
      return royalCoordsList;
    }
    function getCountOfTypesFromPiecesByType(piecesByType, arrayOfPieces, color) {
      const WorB = math2.getWorBFromColor(color);
      let count = 0;
      for (let i = 0; i < arrayOfPieces.length; i++) {
        const thisType = arrayOfPieces[i] + WorB;
        if (!piecesByType[thisType]) return console.error(`Cannot fetch royal count of type ${thisType} when the list is undefined!`);
        let length = piecesByType[thisType].length;
        if (piecesByType[thisType].undefineds) length -= piecesByType[thisType].undefineds.length;
        count += length;
      }
      return count;
    }
    function getCoordsOfAllPieces(gamefile2) {
      const allCoords = [];
      forEachPieceInPiecesByType(callback, gamefile2.ourPieces);
      function callback(type, coords) {
        if (coords) allCoords.push(coords);
      }
      return allCoords;
    }
    function getCoordsOfAllPiecesByKey(piecesByKey) {
      const allCoords = [];
      forEachPieceInKeysState(callback, piecesByKey);
      function callback(type, coords) {
        allCoords.push(coords);
      }
      return allCoords;
    }
    function getPieceCount(piecesByType) {
      let pieceCount = 0;
      pieces.forEachPieceType(appendCount);
      function appendCount(type) {
        pieceCount += piecesByType[type].length;
      }
      return pieceCount;
    }
    function getPieceCountOfColorFromPiecesByType(piecesByType, color) {
      let pieceCount = 0;
      pieces.forEachPieceTypeOfColor(color, appendCount);
      function appendCount(type) {
        const thisTypeList = piecesByType[type];
        for (let i = 0; i < thisTypeList.length; i++) {
          const thisPiece = thisTypeList[i];
          if (thisPiece) pieceCount++;
        }
      }
      return pieceCount;
    }
    function getPieceCountOfGame(gamefile2, { ignoreVoids, ignoreObstacles } = {}) {
      if (!gamefile2.ourPieces) return console.error("Cannot count pieces, ourPieces is not defined");
      let count = 0;
      for (const key in gamefile2.ourPieces) {
        if (ignoreVoids && key === "voidsN") continue;
        if (ignoreObstacles && key === "obstaclesN") continue;
        const typeList = gamefile2.ourPieces[key];
        count += typeList.length;
        if (typeList.undefineds) count -= typeList.undefineds.length;
      }
      return count;
    }
    function calcPieceIndexInAllPieces(gamefile2, piece) {
      const type = piece.type;
      const pieceIndex = piece.index;
      let index = 0;
      let foundPiece = false;
      pieces.forEachPieceType(iterate);
      function iterate(listType) {
        if (foundPiece) return;
        if (listType.startsWith("voids")) return;
        const list = gamefile2.ourPieces[listType];
        if (listType === type) {
          index += pieceIndex;
          foundPiece = true;
          return;
        } else {
          index += list.length;
        }
      }
      if (foundPiece) return index;
      return console.error(`Could not find piece type ${piece.type} with index ${piece.index} when calculating its index in all the pieces!`);
    }
    function getRoyalCoords(gamefile2, color) {
      const royals = pieces.royals;
      const WorB = math2.getWorBFromColor(color);
      const piecesByType = gamefile2.ourPieces;
      const royalCoords = [];
      for (let i = 0; i < royals.length; i++) {
        const thisRoyalType = royals[i] + WorB;
        const thisTypeList = piecesByType[thisRoyalType];
        if (!thisTypeList) return console.error(`Cannot fetch royal coords of type ${thisRoyalType} when the list is undefined!`);
        for (let a = 0; a < thisTypeList.length; a++) {
          const thisPieceCoords = thisTypeList[a];
          if (thisPieceCoords) royalCoords.push(thisPieceCoords);
        }
      }
      return royalCoords;
    }
    function getRoyalCountOfColor(piecesByKey, color) {
      const royals = pieces.royals;
      const WorB = math2.getWorBFromColor(color);
      let royalCount = 0;
      for (const key in piecesByKey) {
        const type = piecesByKey[key];
        const thisColor = math2.getPieceColorFromType(type);
        if (!thisColor.endsWith(WorB)) return;
        const strippedType = math2.trimWorBFromType(type);
        if (!royals.includes(strippedType)) continue;
        royalCount++;
      }
      return royalCount;
    }
    return Object.freeze({
      pieceCountToDisableCheckmate,
      getPieceCountOfType,
      forEachPieceInGame,
      forEachPieceInPiecesByType,
      forEachPieceInKeysState,
      deleteIndexFromPieceList,
      getPieceIndexByTypeAndCoords,
      getPieceTypeAtCoords,
      getPieceAtCoords,
      getPieceFromTypeAndCoords,
      updateGameConclusion,
      concludeGame,
      getJumpingRoyalCoords,
      getCountOfTypesFromPiecesByType,
      getCoordsOfAllPieces,
      getCoordsOfAllPiecesByKey,
      getPieceCount,
      getPieceCountOfColorFromPiecesByType,
      calcPieceIndexInAllPieces,
      getRoyalCoords,
      getRoyalCountOfColor,
      getPieceCountOfGame,
      isGameOver
    });
  }();

  // src/client/scripts/game/chess/checkdetection.mjs
  var checkdetection2 = function() {
    function detectCheck(gamefile2, color, attackers) {
      if (!gamefile2) throw new Error("Cannot detect check of an undefined game!");
      if (color !== "white" && color !== "black") throw new Error(`Cannot detect check of the team of color ${color}!`);
      if (attackers != null && attackers.length !== 0) throw new Error(`Attackers parameter must be an empty array []! Received: ${JSON.stringify(attackers)}`);
      const royalCoords = gamefileutility2.getRoyalCoords(gamefile2, color);
      const royalsInCheck = [];
      for (let i = 0; i < royalCoords.length; i++) {
        const thisRoyalCoord = royalCoords[i];
        if (isSquareBeingAttacked(gamefile2, thisRoyalCoord, color, attackers)) royalsInCheck.push(thisRoyalCoord);
      }
      if (royalsInCheck.length > 0) return royalsInCheck;
      return false;
    }
    function isSquareBeingAttacked(gamefile2, coord, colorOfFriendly, attackers) {
      if (!gamefile2) throw new Error("Cannot detect if a square of an undefined game is being attacked!");
      if (!coord) return false;
      if (colorOfFriendly !== "white" && colorOfFriendly !== "black") throw new Error(`Cannot detect if an opponent is attacking the square of the team of color ${colorOfFriendly}!`);
      let atleast1Attacker = false;
      if (doesVicinityAttackSquare(gamefile2, coord, colorOfFriendly, attackers)) atleast1Attacker = true;
      if (doesPawnAttackSquare(gamefile2, coord, colorOfFriendly, attackers)) atleast1Attacker = true;
      if (doesSlideAttackSquare(gamefile2, coord, colorOfFriendly, attackers)) atleast1Attacker = true;
      return atleast1Attacker;
    }
    function doesVicinityAttackSquare(gamefile2, coords, color, attackers) {
      const vicinity = gamefile2.vicinity;
      for (const key in vicinity) {
        const thisVicinity = vicinity[key];
        const thisSquare = math2.getCoordsFromKey(key);
        const actualSquare = [coords[0] + thisSquare[0], coords[1] + thisSquare[1]];
        const key2 = math2.getKeyFromCoords(actualSquare);
        const typeOnSquare = gamefile2.piecesOrganizedByKey[key2];
        if (!typeOnSquare) continue;
        const typeOnSquareColor = math2.getPieceColorFromType(typeOnSquare);
        if (color === typeOnSquareColor) continue;
        const typeOnSquareConcat = math2.trimWorBFromType(typeOnSquare);
        if (thisVicinity.includes(typeOnSquareConcat)) {
          if (attackers) appendAttackerToList(attackers, { coords: actualSquare, slidingCheck: false });
          return true;
        }
        ;
      }
      return false;
    }
    function doesPawnAttackSquare(gamefile2, coords, color, attackers) {
      const oneOrNegOne = color === "white" ? 1 : -1;
      for (let a = -1; a <= 1; a += 2) {
        const thisSquare = [coords[0] - a, coords[1] + oneOrNegOne];
        const key = math2.getKeyFromCoords(thisSquare);
        const pieceOnSquare = gamefile2.piecesOrganizedByKey[key];
        if (!pieceOnSquare) continue;
        const pieceIsFriendly = color === math2.getPieceColorFromType(pieceOnSquare);
        if (pieceIsFriendly) continue;
        const pieceIsPawn = pieceOnSquare.startsWith("pawns");
        if (pieceIsPawn) {
          if (attackers) appendAttackerToList(attackers, { coords: thisSquare, slidingCheck: false });
          return true;
        }
      }
      return false;
    }
    function doesSlideAttackSquare(gamefile2, coords, color, attackers) {
      let atleast1Attacker = false;
      for (const direction of gamefile2.startSnapshot.slidingPossible) {
        const directionKey = math2.getKeyFromCoords(direction);
        const key = organizedlines2.getKeyFromLine(direction, coords);
        if (doesLineAttackSquare(gamefile2, gamefile2.piecesOrganizedByLines[directionKey][key], direction, coords, color, attackers)) atleast1Attacker = true;
      }
      return atleast1Attacker;
    }
    function doesLineAttackSquare(gamefile2, line, direction, coords, color, attackers) {
      if (!line) return false;
      const directionKey = math2.getKeyFromCoords(direction);
      let foundCheckersCount = 0;
      for (const thisPiece of line) {
        const thisPieceColor = math2.getPieceColorFromType(thisPiece.type);
        if (color === thisPieceColor) continue;
        if (thisPieceColor === "neutral") continue;
        const thisPieceMoveset = legalmoves.getPieceMoveset(gamefile2, thisPiece.type);
        if (!thisPieceMoveset.sliding) continue;
        const moveset = thisPieceMoveset.sliding[directionKey];
        if (!moveset) continue;
        const thisPieceLegalSlide = legalmoves.slide_CalcLegalLimit(line, direction, moveset, thisPiece.coords, thisPieceColor);
        if (!thisPieceLegalSlide) continue;
        if (!legalmoves.doesSlidingMovesetContainSquare(thisPieceLegalSlide, direction, thisPiece.coords, coords)) continue;
        if (!attackers) return true;
        foundCheckersCount++;
        appendAttackerToList(attackers, { coords: thisPiece.coords, slidingCheck: true });
      }
      return foundCheckersCount > 0;
    }
    function appendAttackerToList(attackers, attacker) {
      for (let i = 0; i < attackers.length; i++) {
        const thisAttacker = attackers[i];
        if (!math2.areCoordsEqual(thisAttacker.coords, attacker.coords)) continue;
        if (attacker.slidingCheck) thisAttacker.slidingCheck = true;
        return;
      }
      attackers.push(attacker);
    }
    function removeMovesThatPutYouInCheck(gamefile2, moves, pieceSelected, color) {
      if (color === "neutral") return;
      if (!wincondition2.isOpponentUsingWinCondition(gamefile2, "checkmate")) return;
      removeSlidingMovesThatPutYouInCheck(gamefile2, moves, pieceSelected, color);
      removeIndividualMovesThatPutYouInCheck(gamefile2, moves.individual, pieceSelected, color);
    }
    function removeIndividualMovesThatPutYouInCheck(gamefile2, individualMoves, pieceSelected, color) {
      if (!individualMoves) return;
      for (let i = individualMoves.length - 1; i >= 0; i--) {
        const thisMove = individualMoves[i];
        if (doesMovePutInCheck(gamefile2, pieceSelected, thisMove, color)) individualMoves.splice(i, 1);
      }
    }
    function doesMovePutInCheck(gamefile2, pieceSelected, destCoords, color) {
      const move = { type: pieceSelected.type, startCoords: math2.deepCopyObject(pieceSelected.coords), endCoords: movepiece.stripSpecialMoveTagsFromCoords(destCoords) };
      specialdetect.transferSpecialFlags_FromCoordsToMove(destCoords, move);
      return movepiece.simulateMove(gamefile2, move, color).isCheck;
    }
    function removeSlidingMovesThatPutYouInCheck(gamefile2, moves, pieceSelected, color) {
      if (!moves.sliding) return;
      const royalCoords = gamefileutility2.getJumpingRoyalCoords(gamefile2, color);
      if (royalCoords.length === 0) return;
      if (addressExistingChecks(gamefile2, moves, gamefile2.inCheck, pieceSelected.coords, color)) return;
      royalCoords.forEach((thisRoyalCoords) => {
        removeSlidingMovesThatOpenDiscovered(gamefile2, moves, thisRoyalCoords, pieceSelected, color);
      });
    }
    function addressExistingChecks(gamefile2, legalMoves, royalCoords, selectedPieceCoords, color) {
      if (!gamefile2.inCheck) return false;
      if (!isColorInCheck(gamefile2, color)) return;
      const attackerCount = gamefile2.attackers.length;
      if (attackerCount === 0) throw new Error("We are in check, but there is no specified attacker!");
      const attacker = gamefile2.attackers[0];
      const capturingNotPossible = attackerCount > 1;
      if (!capturingNotPossible && legalmoves.checkIfMoveLegal(legalMoves, selectedPieceCoords, attacker.coords, { ignoreIndividualMoves: true })) {
        legalMoves.individual.push(attacker.coords);
      }
      const dist = math2.chebyshevDistance(royalCoords[0], attacker.coords);
      if (!attacker.slidingCheck || dist === 1) {
        delete legalMoves.sliding;
        return true;
      }
      appendBlockingMoves(royalCoords[0], attacker.coords, legalMoves, selectedPieceCoords);
      delete legalMoves.sliding;
      return true;
    }
    function isColorInCheck(gamefile2, color) {
      const royals = gamefileutility2.getRoyalCoords(gamefile2, color).map(math2.getKeyFromCoords);
      const checkedRoyals = gamefile2.inCheck.map(math2.getKeyFromCoords);
      return (/* @__PURE__ */ new Set([...royals, ...checkedRoyals])).size !== royals.length + checkedRoyals.length;
    }
    function removeSlidingMovesThatOpenDiscovered(gamefile2, moves, kingCoords, pieceSelected, color) {
      const selectedPieceCoords = pieceSelected.coords;
      const sameLines = [];
      for (const line of gamefile2.startSnapshot.slidingPossible) {
        const lineKey1 = organizedlines2.getKeyFromLine(line, kingCoords);
        const lineKey2 = organizedlines2.getKeyFromLine(line, selectedPieceCoords);
        if (lineKey1 !== lineKey2) continue;
        sameLines.push(line);
      }
      ;
      if (sameLines.length === 0) return;
      const deletedPiece = math2.deepCopyObject(pieceSelected);
      movepiece.deletePiece(gamefile2, pieceSelected, { updateData: false });
      for (const direction1 of sameLines) {
        const strline = math2.getKeyFromCoords(direction1);
        const key = organizedlines2.getKeyFromLine(direction1, kingCoords);
        const line = gamefile2.piecesOrganizedByLines[strline][key];
        const opensDiscovered = doesLineAttackSquare(gamefile2, line, direction1, kingCoords, color);
        if (!opensDiscovered) continue;
        for (const direction2 of Object.keys(moves.sliding)) {
          const direction2NumbArray = math2.getCoordsFromKey(direction2);
          if (math2.areCoordsEqual(direction1, direction2NumbArray)) continue;
          delete moves.sliding[direction2];
        }
      }
      movepiece.addPiece(gamefile2, deletedPiece.type, deletedPiece.coords, deletedPiece.index, { updateData: false });
    }
    function appendBlockingMoves(square1, square2, moves, coords) {
      const direction = [square1[0] - square2[0], square1[1] - square2[1]];
      const box = {
        left: Math.min(square1[0], square2[0]),
        right: Math.max(square1[0], square2[0]),
        top: Math.max(square1[1], square2[1]),
        bottom: Math.min(square1[1], square2[1])
      };
      for (const lineKey in moves.sliding) {
        const line = math2.getCoordsFromKey(lineKey);
        const c1 = organizedlines2.getCFromLine(line, coords);
        const c2 = organizedlines2.getCFromLine(direction, square2);
        const blockPoint = math2.getLineIntersection(line[0], line[1], c1, direction[0], direction[1], c2);
        if (blockPoint === null) continue;
        if (!math2.boxContainsSquare(box, blockPoint)) continue;
        if (!math2.areCoordsIntegers(blockPoint)) continue;
        if (math2.areCoordsEqual(blockPoint, square1)) continue;
        if (math2.areCoordsEqual(blockPoint, square2)) continue;
        if (legalmoves.checkIfMoveLegal(moves, coords, blockPoint, { ignoreIndividualMoves: true })) moves.individual.push(blockPoint);
      }
    }
    return Object.freeze({
      detectCheck,
      removeMovesThatPutYouInCheck,
      doesMovePutInCheck
    });
  }();

  // src/client/scripts/game/chess/movepiece.mjs
  var movepiece = function() {
    function makeMove(gamefile2, move, { flipTurn = true, recordMove = true, pushClock = true, doGameOverChecks = true, concludeGameIfOver = true, animate = true, updateData = true, updateProperties = true, simulated = false } = {}) {
      const piece = gamefileutility2.getPieceAtCoords(gamefile2, move.startCoords);
      if (!piece) throw new Error(`Cannot make move because no piece exists at coords ${move.startCoords}.`);
      move.type = piece.type;
      const trimmedType = math2.trimWorBFromType(move.type);
      storeRewindInfoOnMove(gamefile2, move, piece.index, { simulated });
      if (recordMove || updateProperties) deleteEnpassantAndSpecialRightsProperties(gamefile2, move.startCoords, move.endCoords);
      let specialMoveMade;
      if (gamefile2.specialMoves[trimmedType]) specialMoveMade = gamefile2.specialMoves[trimmedType](gamefile2, piece, move, { updateData, animate, updateProperties, simulated });
      if (!specialMoveMade) movePiece_NoSpecial(gamefile2, piece, move, { updateData, recordMove, animate, simulated });
      const wasACapture = move.captured != null;
      gamefile2.moveIndex++;
      if (recordMove) gamefile2.moves.push(move);
      if (updateProperties) incrementMoveRule(gamefile2, piece.type, wasACapture);
      if (flipTurn) flipWhosTurn(gamefile2, { pushClock, doGameOverChecks });
      updateInCheck(gamefile2, recordMove);
      if (doGameOverChecks) gamefileutility2.updateGameConclusion(gamefile2, { concludeGameIfOver, simulated });
      else if (updateProperties) wincondition2.detectThreecheck(gamefile2);
      if (updateData) {
        guinavigation.update_MoveButtons();
        main2.renderThisFrame();
      }
      if (!simulated) arrows.clearListOfHoveredPieces();
    }
    function storeRewindInfoOnMove(gamefile2, move, pieceIndex, { simulated = false } = {}) {
      const rewindInfoAlreadyPresent = move.rewindInfo != null;
      const rewindInfo = move.rewindInfo || {};
      if (simulated && move.promotion) rewindInfo.pawnIndex = pieceIndex;
      if (!rewindInfoAlreadyPresent) {
        rewindInfo.inCheck = math2.deepCopyObject(gamefile2.inCheck);
        rewindInfo.gameConclusion = gamefile2.gameConclusion;
        if (gamefile2.attackers) rewindInfo.attackers = math2.deepCopyObject(gamefile2.attackers);
        if (gamefile2.enpassant) rewindInfo.enpassant = gamefile2.enpassant;
        if (gamefile2.moveRuleState != null) rewindInfo.moveRuleState = gamefile2.moveRuleState;
        if (gamefile2.checksGiven) rewindInfo.checksGiven = gamefile2.checksGiven;
        let key = math2.getKeyFromCoords(move.startCoords);
        if (gamefile2.specialRights[key]) rewindInfo.specialRightStart = true;
        key = math2.getKeyFromCoords(move.endCoords);
        if (gamefile2.specialRights[key]) rewindInfo.specialRightEnd = true;
      }
      move.rewindInfo = rewindInfo;
    }
    function deleteEnpassantAndSpecialRightsProperties(gamefile2, startCoords, endCoords) {
      delete gamefile2.enpassant;
      let key = math2.getKeyFromCoords(startCoords);
      delete gamefile2.specialRights[key];
      key = math2.getKeyFromCoords(endCoords);
      delete gamefile2.specialRights[key];
    }
    function movePiece_NoSpecial(gamefile2, piece, move, { updateData = true, animate = true, simulated = false } = {}) {
      const capturedPiece = gamefileutility2.getPieceAtCoords(gamefile2, move.endCoords);
      if (capturedPiece) move.captured = capturedPiece.type;
      if (capturedPiece && simulated) move.rewindInfo.capturedIndex = capturedPiece.index;
      if (capturedPiece) deletePiece(gamefile2, capturedPiece, { updateData });
      movePiece(gamefile2, piece, move.endCoords, { updateData });
      if (animate) animation.animatePiece(piece.type, move.startCoords, move.endCoords, capturedPiece);
    }
    function movePiece(gamefile2, piece, endCoords, { updateData = true } = {}) {
      gamefile2.ourPieces[piece.type][piece.index] = endCoords;
      organizedlines2.removeOrganizedPiece(gamefile2, piece.coords);
      organizedlines2.organizePiece(piece.type, endCoords, gamefile2);
      if (updateData) piecesmodel.movebufferdata(gamefile2, piece, endCoords);
    }
    function addPiece(gamefile2, type, coords, desiredIndex, { updateData = true } = {}) {
      const list = gamefile2.ourPieces[type];
      if (desiredIndex == null) desiredIndex = list.undefineds[0];
      if (desiredIndex == null && updateData) throw new Error("Cannot add a piece and update the data when there are no undefined placeholders remaining!");
      if (desiredIndex == null) list.push(coords);
      else {
        const isPieceAtCoords = gamefileutility2.getPieceTypeAtCoords(gamefile2, coords) != null;
        if (isPieceAtCoords) throw new Error("Can't add a piece on top of another piece!");
        const deleteSuccussful = math2.deleteValueFromOrganizedArray(gamefile2.ourPieces[type].undefineds, desiredIndex) !== false;
        if (!deleteSuccussful) throw new Error("Index to add a piece has an existing piece on it!");
        list[desiredIndex] = coords;
      }
      organizedlines2.organizePiece(type, coords, gamefile2);
      if (!updateData) return;
      const undefinedPiece = { type, index: desiredIndex };
      piecesmodel.overwritebufferdata(gamefile2, undefinedPiece, coords, type);
      if (organizedlines2.areWeShortOnUndefineds(gamefile2)) organizedlines2.addMoreUndefineds(gamefile2, { log: true });
    }
    function deletePiece(gamefile2, piece, { updateData = true } = {}) {
      const list = gamefile2.ourPieces[piece.type];
      gamefileutility2.deleteIndexFromPieceList(list, piece.index);
      organizedlines2.removeOrganizedPiece(gamefile2, piece.coords);
      if (updateData) piecesmodel.deletebufferdata(gamefile2, piece);
    }
    function incrementMoveRule(gamefile2, typeMoved, wasACapture) {
      if (!gamefile2.gameRules.moveRule) return;
      if (wasACapture || typeMoved.startsWith("pawns")) gamefile2.moveRuleState = 0;
      else gamefile2.moveRuleState++;
    }
    function flipWhosTurn(gamefile2, { pushClock = true, doGameOverChecks = true } = {}) {
      gamefile2.whosTurn = movesscript2.getWhosTurnAtMoveIndex(gamefile2, gamefile2.moveIndex);
      if (doGameOverChecks) guigameinfo.updateWhosTurn(gamefile2);
      if (pushClock) clock.push();
    }
    function updateInCheck(gamefile2, flagMoveAsCheck = true) {
      let attackers = void 0;
      const whosTurnItWasAtMoveIndex = movesscript2.getWhosTurnAtMoveIndex(gamefile2, gamefile2.moveIndex);
      const oppositeColor = math2.getOppositeColor(whosTurnItWasAtMoveIndex);
      if (gamefile2.gameRules.winConditions[oppositeColor].includes("checkmate")) attackers = [];
      gamefile2.inCheck = checkdetection2.detectCheck(gamefile2, whosTurnItWasAtMoveIndex, attackers);
      gamefile2.attackers = attackers || [];
      if (gamefile2.inCheck && flagMoveAsCheck) movesscript2.flagLastMoveAsCheck(gamefile2);
    }
    function makeAllMovesInGame(gamefile2, moves) {
      if (gamefile2.moveIndex !== -1) throw new Error("Cannot make all moves in game when we're not at the beginning.");
      for (let i = 0; i < moves.length; i++) {
        const shortmove = moves[i];
        const move = calculateMoveFromShortmove(gamefile2, shortmove);
        if (!move) throw new Error(`Cannot make all moves in game! There was a move in an invalid format: ${shortmove}. Index: ${i}`);
        const isLastMove = i === moves.length - 1;
        const animate = isLastMove;
        makeMove(gamefile2, move, { pushClock: false, updateData: false, concludeGameIfOver: false, doGameOverChecks: false, animate });
      }
      if (moves.length === 0) updateInCheck(gamefile2, false);
      gamefileutility2.updateGameConclusion(gamefile2, { concludeGameIfOver: false });
    }
    function calculateMoveFromShortmove(gamefile2, shortmove) {
      if (!movesscript2.areWeViewingLatestMove(gamefile2)) return console.error("Cannot calculate Move object from shortmove when we're not viewing the most recently played move.");
      let move;
      try {
        move = formatconverter.ShortToLong_CompactMove(shortmove);
      } catch (error) {
        console.error(error);
        console.error(`Failed to calculate Move from shortmove because it's in an incorrect format: ${shortmove}`);
        return;
      }
      const selectedPiece = gamefileutility2.getPieceAtCoords(gamefile2, move.startCoords);
      if (!selectedPiece) return move;
      const legalSpecialMoves = legalmoves.calculate(gamefile2, selectedPiece, { onlyCalcSpecials: true }).individual;
      for (let i = 0; i < legalSpecialMoves.length; i++) {
        const thisCoord = legalSpecialMoves[i];
        if (!math2.areCoordsEqual(thisCoord, move.endCoords)) continue;
        specialdetect.transferSpecialFlags_FromCoordsToMove(thisCoord, move);
        break;
      }
      return move;
    }
    function forwardToFront(gamefile2, { flipTurn = true, animateLastMove = true, updateData = true, updateProperties = true, simulated = false } = {}) {
      while (true) {
        const nextIndex = gamefile2.moveIndex + 1;
        if (movesscript2.isIndexOutOfRange(gamefile2.moves, nextIndex)) break;
        const nextMove = movesscript2.getMoveFromIndex(gamefile2.moves, nextIndex);
        const isLastMove = movesscript2.isIndexTheLastMove(gamefile2.moves, nextIndex);
        const animate = animateLastMove && isLastMove;
        makeMove(gamefile2, nextMove, { recordMove: false, pushClock: false, doGameOverChecks: false, flipTurn, animate, updateData, updateProperties, simulated });
      }
      if (!simulated) guigameinfo.updateWhosTurn(gamefile2);
      if (updateData) guinavigation.lockRewind();
    }
    function rewindGameToIndex(gamefile2, moveIndex, { removeMove = true, updateData = true } = {}) {
      if (removeMove && !movesscript2.areWeViewingLatestMove(gamefile2)) return console.error("Cannot rewind game to index while deleting moves unless we start at the most recent move. forwardToFront() first.");
      if (gamefile2.moveIndex < moveIndex) return console.error("Cannot rewind game to index when we need to forward instead.");
      while (gamefile2.moveIndex > moveIndex) rewindMove(gamefile2, { animate: false, updateData, removeMove });
      guigameinfo.updateWhosTurn(gamefile2);
      main2.renderThisFrame();
    }
    function rewindMove(gamefile2, { updateData = true, removeMove = true, animate = true } = {}) {
      const move = movesscript2.getMoveFromIndex(gamefile2.moves, gamefile2.moveIndex);
      const trimmedType = math2.trimWorBFromType(move.type);
      let isSpecialMove = false;
      if (gamefile2.specialUndos[trimmedType]) isSpecialMove = gamefile2.specialUndos[trimmedType](gamefile2, move, { updateData, animate });
      if (!isSpecialMove) rewindMove_NoSpecial(gamefile2, move, { updateData, animate });
      gamefile2.inCheck = move.rewindInfo.inCheck;
      if (move.rewindInfo.attackers) gamefile2.attackers = move.rewindInfo.attackers;
      if (removeMove) {
        gamefile2.enpassant = move.rewindInfo.enpassant;
        gamefile2.moveRuleState = move.rewindInfo.moveRuleState;
        gamefile2.checksGiven = move.rewindInfo.checksGiven;
        if (move.rewindInfo.specialRightStart) {
          const key = math2.getKeyFromCoords(move.startCoords);
          gamefile2.specialRights[key] = true;
        }
        if (move.rewindInfo.specialRightEnd) {
          const key = math2.getKeyFromCoords(move.endCoords);
          gamefile2.specialRights[key] = true;
        }
        gamefile2.gameConclusion = move.rewindInfo.gameConclusion;
      }
      delete move.rewindInfo.capturedIndex;
      delete move.rewindInfo.pawnIndex;
      if (removeMove) movesscript2.deleteLastMove(gamefile2.moves);
      gamefile2.moveIndex--;
      if (removeMove) flipWhosTurn(gamefile2, { pushClock: false, doGameOverChecks: false });
      if (updateData) {
        guinavigation.update_MoveButtons();
        main2.renderThisFrame();
      }
    }
    function rewindMove_NoSpecial(gamefile2, move, { updateData = true, animate = true } = {}) {
      const movedPiece = gamefileutility2.getPieceAtCoords(gamefile2, move.endCoords);
      movePiece(gamefile2, movedPiece, move.startCoords, { updateData });
      if (move.captured) {
        const type = move.captured;
        addPiece(gamefile2, type, move.endCoords, move.rewindInfo.capturedIndex, { updateData });
      }
      if (animate) animation.animatePiece(move.type, move.endCoords, move.startCoords);
    }
    function simulateMove(gamefile2, move, colorToTestInCheck, { doGameOverChecks = false } = {}) {
      makeMove(gamefile2, move, { pushClock: false, animate: false, updateData: false, simulated: true, doGameOverChecks, updateProperties: doGameOverChecks });
      const info = {
        isCheck: doGameOverChecks ? gamefile2.inCheck : checkdetection2.detectCheck(gamefile2, colorToTestInCheck, []),
        gameConclusion: doGameOverChecks ? gamefile2.gameConclusion : void 0
      };
      rewindMove(gamefile2, { updateData: false, animate: false });
      return info;
    }
    function stripSpecialMoveTagsFromCoords(coords) {
      return [coords[0], coords[1]];
    }
    return Object.freeze({
      makeMove,
      movePiece,
      addPiece,
      deletePiece,
      makeAllMovesInGame,
      calculateMoveFromShortmove,
      forwardToFront,
      rewindGameToIndex,
      rewindMove,
      simulateMove,
      stripSpecialMoveTagsFromCoords
    });
  }();

  // src/client/scripts/game/chess/legalmoves.mjs
  var legalmoves = function() {
    function genVicinity(gamefile2) {
      const vicinity = {};
      if (!gamefile2.pieceMovesets) return console.error("Cannot generate vicinity before pieceMovesets is initialized.");
      for (let i = 0; i < pieces.white.length; i++) {
        const thisPieceType = pieces.white[i];
        let thisPieceIndividualMoveset;
        if (getPieceMoveset(gamefile2, thisPieceType).individual) thisPieceIndividualMoveset = getPieceMoveset(gamefile2, thisPieceType).individual;
        else thisPieceIndividualMoveset = [];
        for (let a = 0; a < thisPieceIndividualMoveset.length; a++) {
          const thisIndividualMove = thisPieceIndividualMoveset[a];
          const key = math2.getKeyFromCoords(thisIndividualMove);
          if (!vicinity[key]) vicinity[key] = [];
          const pieceTypeConcat = math2.trimWorBFromType(thisPieceType);
          if (!vicinity[key].includes(pieceTypeConcat)) vicinity[key].push(pieceTypeConcat);
        }
      }
      return vicinity;
    }
    function getPieceMoveset(gamefile2, pieceType) {
      pieceType = math2.trimWorBFromType(pieceType);
      const movesetFunc = gamefile2.pieceMovesets[pieceType];
      if (!movesetFunc) return {};
      return movesetFunc();
    }
    function calculate(gamefile2, piece, { onlyCalcSpecials = false } = {}) {
      if (piece.index === void 0) throw new Error("To calculate a piece's legal moves, we must have the index property.");
      const coords = piece.coords;
      const type = piece.type;
      const trimmedType = math2.trimWorBFromType(type);
      const color = math2.getPieceColorFromType(type);
      const thisPieceMoveset = getPieceMoveset(gamefile2, type);
      let legalIndividualMoves = [];
      const legalSliding = {};
      if (!onlyCalcSpecials) {
        shiftIndividualMovesetByCoords(thisPieceMoveset.individual, coords);
        legalIndividualMoves = moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile2, thisPieceMoveset.individual, color);
        if (thisPieceMoveset.sliding) {
          const lines = gamefile2.startSnapshot.slidingPossible;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!thisPieceMoveset.sliding[line]) continue;
            const key = organizedlines2.getKeyFromLine(line, coords);
            legalSliding[line] = slide_CalcLegalLimit(gamefile2.piecesOrganizedByLines[line][key], line, thisPieceMoveset.sliding[line], coords, color);
          }
          ;
        }
        ;
      }
      if (gamefile2.specialDetects[trimmedType]) gamefile2.specialDetects[trimmedType](gamefile2, coords, color, legalIndividualMoves);
      const moves = {
        individual: legalIndividualMoves,
        sliding: legalSliding
      };
      checkdetection2.removeMovesThatPutYouInCheck(gamefile2, moves, piece, color);
      return moves;
    }
    function shiftIndividualMovesetByCoords(indivMoveset, coords) {
      if (!indivMoveset) return;
      indivMoveset.forEach((indivMove) => {
        indivMove[0] += coords[0];
        indivMove[1] += coords[1];
      });
    }
    function moves_RemoveOccupiedByFriendlyPieceOrVoid(gamefile2, individualMoves, color) {
      if (!individualMoves) return;
      for (let i = individualMoves.length - 1; i >= 0; i--) {
        const thisMove = individualMoves[i];
        const pieceAtSquare = gamefileutility2.getPieceTypeAtCoords(gamefile2, thisMove);
        if (!pieceAtSquare) continue;
        const pieceAtSquareColor = math2.getPieceColorFromType(pieceAtSquare);
        if (color === pieceAtSquareColor || pieceAtSquare === "voidsN") individualMoves.splice(i, 1);
      }
      return individualMoves;
    }
    function slide_CalcLegalLimit(line, direction, slideMoveset, coords, color) {
      if (!slideMoveset) return;
      const axis = direction[0] === 0 ? 1 : 0;
      const limit = math2.copyCoords(slideMoveset);
      for (let i = 0; i < line.length; i++) {
        const thisPiece = line[i];
        const thisPieceSteps = Math.floor((thisPiece.coords[axis] - coords[axis]) / direction[axis]);
        const thisPieceColor = math2.getPieceColorFromType(thisPiece.type);
        const isFriendlyPiece = color === thisPieceColor;
        const isVoid = thisPiece.type === "voidsN";
        if (thisPieceSteps < 0) {
          const newLeftSlideLimit = isFriendlyPiece || isVoid ? thisPieceSteps + 1 : thisPieceSteps;
          if (newLeftSlideLimit > limit[0]) limit[0] = newLeftSlideLimit;
        } else if (thisPieceSteps > 0) {
          const newRightSlideLimit = isFriendlyPiece || isVoid ? thisPieceSteps - 1 : thisPieceSteps;
          if (newRightSlideLimit < limit[1]) limit[1] = newRightSlideLimit;
        }
      }
      return limit;
    }
    function checkIfMoveLegal(legalMoves, startCoords, endCoords, { ignoreIndividualMoves } = {}) {
      if (math2.areCoordsEqual(startCoords, endCoords)) return false;
      if (!ignoreIndividualMoves) {
        const individual = legalMoves.individual;
        const length = !individual ? 0 : individual.length;
        for (let i = 0; i < length; i++) {
          const thisIndividual = individual[i];
          if (!math2.areCoordsEqual(endCoords, thisIndividual)) continue;
          specialdetect.transferSpecialFlags_FromCoordsToCoords(thisIndividual, endCoords);
          return true;
        }
      }
      for (const strline in legalMoves.sliding) {
        const line = math2.getCoordsFromKey(strline);
        const limits = legalMoves.sliding[strline];
        const selectedPieceLine = organizedlines2.getKeyFromLine(line, startCoords);
        const clickedCoordsLine = organizedlines2.getKeyFromLine(line, endCoords);
        if (!limits || selectedPieceLine !== clickedCoordsLine) continue;
        if (!doesSlidingMovesetContainSquare(limits, line, startCoords, endCoords)) continue;
        return true;
      }
      return false;
    }
    function isOpponentsMoveLegal(gamefile2, move, claimedGameConclusion) {
      if (!move) {
        console.log("Opponents move is illegal because it is not defined. There was likely an error in converting it to long format.");
        return "Move is not defined. Probably an error in converting it to long format.";
      }
      const moveCopy = math2.deepCopyObject(move);
      const inCheckB4Forwarding = math2.deepCopyObject(gamefile2.inCheck);
      const attackersB4Forwarding = math2.deepCopyObject(gamefile2.attackers);
      const originalMoveIndex = gamefile2.moveIndex;
      movepiece.forwardToFront(gamefile2, { flipTurn: false, animateLastMove: false, updateData: false, updateProperties: false, simulated: true });
      const piecemoved = gamefileutility2.getPieceAtCoords(gamefile2, moveCopy.startCoords);
      if (!piecemoved) {
        console.log(`Opponent's move is illegal because no piece exists at the startCoords. Move: ${JSON.stringify(moveCopy)}`);
        return rewindGameAndReturnReason("No piece exists at start coords.");
      }
      const colorOfPieceMoved = math2.getPieceColorFromType(piecemoved.type);
      if (colorOfPieceMoved !== gamefile2.whosTurn) {
        console.log(`Opponent's move is illegal because you can't move a non-friendly piece. Move: ${JSON.stringify(moveCopy)}`);
        return rewindGameAndReturnReason("Can't move a non-friendly piece.");
      }
      if (moveCopy.promotion) {
        if (!piecemoved.type.startsWith("pawns")) {
          console.log(`Opponent's move is illegal because you can't promote a non-pawn. Move: ${JSON.stringify(moveCopy)}`);
          return rewindGameAndReturnReason("Can't promote a non-pawn.");
        }
        const colorPromotedTo = math2.getPieceColorFromType(moveCopy.promotion);
        if (gamefile2.whosTurn !== colorPromotedTo) {
          console.log(`Opponent's move is illegal because they promoted to the opposite color. Move: ${JSON.stringify(moveCopy)}`);
          return rewindGameAndReturnReason("Can't promote to opposite color.");
        }
        const strippedPromotion = math2.trimWorBFromType(moveCopy.promotion);
        if (!gamefile2.gameRules.promotionsAllowed[gamefile2.whosTurn].includes(strippedPromotion)) {
          console.log(`Opponent's move is illegal because the specified promotion is illegal. Move: ${JSON.stringify(moveCopy)}`);
          return rewindGameAndReturnReason("Specified promotion is illegal.");
        }
      } else {
        if (specialdetect.isPawnPromotion(gamefile2, piecemoved.type, moveCopy.endCoords)) {
          console.log(`Opponent's move is illegal because they didn't promote at the promotion line. Move: ${JSON.stringify(moveCopy)}`);
          return rewindGameAndReturnReason("Didn't promote when moved to promotion line.");
        }
      }
      const legalMoves = legalmoves.calculate(gamefile2, piecemoved);
      if (!legalmoves.checkIfMoveLegal(legalMoves, moveCopy.startCoords, moveCopy.endCoords)) {
        console.log(`Opponent's move is illegal because the destination coords are illegal. Move: ${JSON.stringify(moveCopy)}`);
        return rewindGameAndReturnReason(`Destination coordinates are illegal. inCheck: ${JSON.stringify(gamefile2.inCheck)}. attackers: ${JSON.stringify(gamefile2.attackers)}. originalMoveIndex: ${originalMoveIndex}. inCheckB4Forwarding: ${inCheckB4Forwarding}. attackersB4Forwarding: ${JSON.stringify(attackersB4Forwarding)}`);
      }
      if (claimedGameConclusion === false || wincondition.isGameConclusionDecisive(claimedGameConclusion)) {
        const color = math2.getPieceColorFromType(piecemoved.type);
        const infoAboutSimulatedMove = movepiece.simulateMove(gamefile2, moveCopy, color, { doGameOverChecks: true });
        if (infoAboutSimulatedMove.gameConclusion !== claimedGameConclusion) {
          console.log(`Opponent's move is illegal because gameConclusion doesn't match. Should be "${infoAboutSimulatedMove.gameConclusion}", received "${claimedGameConclusion}". Their move: ${JSON.stringify(moveCopy)}`);
          return rewindGameAndReturnReason(`Game conclusion isn't correct. Received: ${claimedGameConclusion}. Should be ${infoAboutSimulatedMove.gameConclusion}`);
        }
      }
      movepiece.rewindGameToIndex(gamefile2, originalMoveIndex, { removeMove: false, updateData: false });
      return true;
      function rewindGameAndReturnReason(reasonIllegal) {
        movepiece.rewindGameToIndex(gamefile2, originalMoveIndex, { removeMove: false, updateData: false });
        return reasonIllegal;
      }
    }
    function doesSlidingMovesetContainSquare(slideMoveset, direction, pieceCoords, coords) {
      const axis = direction[0] === 0 ? 1 : 0;
      const coordMag = coords[axis];
      const min = slideMoveset[0] * direction[axis] + pieceCoords[axis];
      const max = slideMoveset[1] * direction[axis] + pieceCoords[axis];
      return coordMag >= min && coordMag <= max;
    }
    function hasAtleast1Move(moves) {
      if (moves.individual.length > 0) return true;
      for (const line in moves.sliding)
        if (doesSlideHaveWidth(moves.sliding[line])) return true;
      function doesSlideHaveWidth(slide) {
        if (!slide) return false;
        return slide[1] - slide[0] > 0;
      }
      return false;
    }
    return Object.freeze({
      genVicinity,
      getPieceMoveset,
      calculate,
      checkIfMoveLegal,
      doesSlidingMovesetContainSquare,
      hasAtleast1Move,
      slide_CalcLegalLimit,
      isOpponentsMoveLegal
    });
  }();

  // src/client/scripts/game/misc/onlinegame.mjs
  var onlinegame2 = function() {
    let inOnlineGame = false;
    let gameID;
    let isPrivate;
    let ourColor;
    let gameHasConcluded;
    let inSync = false;
    const tabNameFlash = {
      originalDocumentTitle: document.title,
      timeoutID: void 0,
      moveSound_timeoutID: void 0
    };
    const afk = {
      timeUntilAFKSecs: 40,
      // 40 + 20 = 1 minute
      timeUntilAFKSecs_Abortable: 20,
      // 20 + 20 = 40 seconds
      timeUntilAFKSecs_Untimed: 100,
      // 100 + 20 = 2 minutes
      /** The amount of time we have, in milliseconds, from the time we alert the
       * server we are afk, to the time we lose if we don't return. */
      timerToLossFromAFK: 2e4,
      /** The ID of the timer to alert the server we are afk. */
      timeoutID: void 0,
      timeWeLoseFromAFK: void 0,
      /** The timeout ID of the timer to display the next "You are AFK..." message. */
      displayAFKTimeoutID: void 0,
      /** The timeout ID of the timer to play the next violin staccato note */
      playStaccatoTimeoutID: void 0,
      timeOpponentLoseFromAFK: void 0,
      /** The timeout ID of the timer to display the next "Opponent is AFK..." message. */
      displayOpponentAFKTimeoutID: void 0
    };
    const disconnect = {
      timeOpponentLoseFromDisconnect: void 0,
      /** The timeout ID of the timer to display the next "Opponent has disconnected..." message. */
      displayOpponentDisconnectTimeoutID: void 0
    };
    const serverRestart = {
      /** The time the server plans on restarting, if it has alerted us it is, otherwise false. */
      time: false,
      /** The minute intervals at which to display on screen the server is restarting. */
      keyMinutes: [30, 20, 15, 10, 5, 2, 1, 0],
      /** The timeout ID of the timer to display the next "Server restarting..." message.
       * This can be used to cancel the timer when the server informs us it's already restarted. */
      timeoutID: void 0
    };
    function getGameID() {
      return gameID;
    }
    function areInOnlineGame() {
      return inOnlineGame;
    }
    function getIsPrivate() {
      return isPrivate;
    }
    function getOurColor() {
      return ourColor;
    }
    function hasGameConcluded() {
      return gameHasConcluded;
    }
    function setInSyncFalse() {
      inSync = false;
    }
    function update() {
      if (!inOnlineGame) return;
      updateAFK();
    }
    function updateAFK() {
      if (!input.atleast1InputThisFrame() || game2.getGamefile().gameConclusion) return;
      if (afk.timeWeLoseFromAFK) tellServerWeBackFromAFK();
      rescheduleAlertServerWeAFK();
    }
    function rescheduleAlertServerWeAFK() {
      clearTimeout(afk.timeoutID);
      const gamefile2 = game2.getGamefile();
      if (!isItOurTurn() || gamefileutility2.isGameOver(gamefile2) || isPrivate && clock.isGameUntimed()) return;
      const timeUntilAFKSecs = !movesscript2.isGameResignable(game2.getGamefile()) ? afk.timeUntilAFKSecs_Abortable : clock.isGameUntimed() ? afk.timeUntilAFKSecs_Untimed : afk.timeUntilAFKSecs;
      afk.timeoutID = setTimeout(tellServerWeAFK, timeUntilAFKSecs * 1e3);
    }
    function cancelAFKTimer() {
      clearTimeout(afk.timeoutID);
      clearTimeout(afk.displayAFKTimeoutID);
      clearTimeout(afk.playStaccatoTimeoutID);
      clearTimeout(afk.displayOpponentAFKTimeoutID);
    }
    function tellServerWeAFK() {
      websocket.sendmessage("game", "AFK");
      afk.timeWeLoseFromAFK = Date.now() + afk.timerToLossFromAFK;
      sound.playSound_lowtime();
      displayWeAFK(20);
      afk.playStaccatoTimeoutID = setTimeout(playStaccatoNote, 1e4, "c3", 10);
    }
    function tellServerWeBackFromAFK() {
      websocket.sendmessage("game", "AFK-Return");
      afk.timeWeLoseFromAFK = void 0;
      clearTimeout(afk.displayAFKTimeoutID);
      clearTimeout(afk.playStaccatoTimeoutID);
      afk.displayAFKTimeoutID = void 0;
      afk.playStaccatoTimeoutID = void 0;
    }
    function displayWeAFK(secsRemaining) {
      const resigningOrAborting = movesscript2.isGameResignable(game2.getGamefile()) ? translations["onlinegame"]["auto_resigning_in"] : translations["onlinegame"]["auto_aborting_in"];
      statustext2.showStatusForDuration(`${translations["onlinegame"]["afk_warning"]} ${resigningOrAborting} ${secsRemaining}...`, 1e3);
      const nextSecsRemaining = secsRemaining - 1;
      if (nextSecsRemaining === 0) return;
      const timeRemainUntilAFKLoss = afk.timeWeLoseFromAFK - Date.now();
      const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1e3;
      afk.displayAFKTimeoutID = setTimeout(displayWeAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
    }
    function playStaccatoNote(note, secsRemaining) {
      if (note === "c3") sound.playSound_viola_c3();
      else if (note === "c4") sound.playSound_violin_c4();
      else return console.error("Invalid violin note");
      const nextSecsRemaining = secsRemaining > 5 ? secsRemaining - 1 : secsRemaining - 0.5;
      if (nextSecsRemaining === 0) return;
      const nextNote = nextSecsRemaining === Math.floor(nextSecsRemaining) ? "c3" : "c4";
      const timeRemainUntilAFKLoss = afk.timeWeLoseFromAFK - Date.now();
      const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1e3;
      afk.playStaccatoTimeoutID = setTimeout(playStaccatoNote, timeToPlayNextDisplayWeAFK, nextNote, nextSecsRemaining);
    }
    function onLostConnection() {
      clearTimeout(afk.displayOpponentAFKTimeoutID);
    }
    function onmessage(data) {
      const message = 5;
      switch (data.action) {
        case "joingame":
          handleJoinGame(data.value);
          break;
        case "move":
          handleOpponentsMove(data.value);
          break;
        case "clock": {
          if (!inOnlineGame) return;
          const message2 = data.value;
          clock.edit(message2.timerWhite, message2.timerBlack, message2.timeNextPlayerLosesAt);
          break;
        }
        case "gameupdate":
          handleServerGameUpdate(data.value);
          break;
        case "unsub":
          websocket.getSubs().game = false;
          inSync = false;
          break;
        case "login":
          statustext2.showStatus(translations["onlinegame"]["not_logged_in"], true, 100);
          websocket.getSubs().game = false;
          inSync = false;
          clock.stop();
          game2.getGamefile().gameConclusion = "limbo";
          selection2.unselectPiece();
          board2.darkenColor();
          break;
        case "nogame":
          statustext2.showStatus(translations["onlinegame"]["game_no_longer_exists"], false, 1.5);
          websocket.getSubs().game = false;
          inSync = false;
          gamefileutility2.concludeGame(game2.getGamefile(), "aborted", { requestRemovalFromActiveGames: false });
          break;
        case "leavegame":
          statustext2.showStatus(translations["onlinegame"]["another_window_connected"]);
          websocket.getSubs().game = false;
          inSync = false;
          closeOnlineGame();
          game2.unloadGame();
          clock.reset();
          guinavigation.close();
          guititle.open();
          break;
        case "opponentafk":
          startOpponentAFKCountdown(data.value?.autoAFKResignTime);
          break;
        case "opponentafkreturn":
          stopOpponentAFKCountdown(data.value);
          break;
        case "opponentdisconnect":
          startOpponentDisconnectCountdown(data.value);
          break;
        case "opponentdisconnectreturn":
          stopOpponentDisconnectCountdown(data.value);
          break;
        case "serverrestart":
          initServerRestart(data.value);
          break;
        case "drawoffer": {
          drawoffers.onOpponentExtendedOffer();
          break;
        }
        case "declinedraw":
          statustext2.showStatus(`Opponent declined draw offer.`);
          break;
        default:
          statustext2.showStatus(`${translations["invites"]["unknown_action_received_1"]} ${message.action} ${translations["invites"]["unknown_action_received_2"]}`, true);
          break;
      }
    }
    function startOpponentAFKCountdown(autoResignTime) {
      stopOpponentAFKCountdown();
      if (!autoResignTime) return console.error("Cannot display opponent is AFK when autoResignTime not specified");
      afk.timeOpponentLoseFromAFK = autoResignTime;
      const timeRemain = autoResignTime - Date.now();
      const secsRemaining = Math.ceil(timeRemain / 1e3);
      displayOpponentAFK(secsRemaining);
    }
    function stopOpponentAFKCountdown() {
      clearTimeout(afk.displayOpponentAFKTimeoutID);
      afk.displayOpponentAFKTimeoutID = void 0;
    }
    function displayOpponentAFK(secsRemaining) {
      const resigningOrAborting = movesscript2.isGameResignable(game2.getGamefile()) ? translations["onlinegame"]["auto_resigning_in"] : translations["onlinegame"]["auto_aborting_in"];
      statustext2.showStatusForDuration(`${translations["onlinegame"]["opponent_afk"]} ${resigningOrAborting} ${secsRemaining}...`, 1e3);
      const nextSecsRemaining = secsRemaining - 1;
      if (nextSecsRemaining === 0) return;
      const timeRemainUntilAFKLoss = afk.timeOpponentLoseFromAFK - Date.now();
      const timeToPlayNextDisplayWeAFK = timeRemainUntilAFKLoss - nextSecsRemaining * 1e3;
      afk.displayOpponentAFKTimeoutID = setTimeout(displayOpponentAFK, timeToPlayNextDisplayWeAFK, nextSecsRemaining);
    }
    function startOpponentDisconnectCountdown({ autoDisconnectResignTime, wasByChoice } = {}) {
      if (!autoDisconnectResignTime) return console.error("Cannot display opponent has disconnected when autoResignTime not specified");
      if (wasByChoice === void 0) return console.error("Cannot display opponent has disconnected when wasByChoice not specified");
      stopOpponentAFKCountdown();
      stopOpponentDisconnectCountdown();
      disconnect.timeOpponentLoseFromDisconnect = autoDisconnectResignTime;
      const timeRemain = autoDisconnectResignTime - Date.now();
      const secsRemaining = Math.ceil(timeRemain / 1e3);
      displayOpponentDisconnect(secsRemaining, wasByChoice);
    }
    function stopOpponentDisconnectCountdown() {
      clearTimeout(disconnect.displayOpponentDisconnectTimeoutID);
      disconnect.displayOpponentDisconnectTimeoutID = void 0;
    }
    function displayOpponentDisconnect(secsRemaining, wasByChoice) {
      const opponent_disconnectedOrLostConnection = wasByChoice ? translations["onlinegame"]["opponent_disconnected"] : translations["onlinegame"]["opponent_lost_connection"];
      const resigningOrAborting = movesscript2.isGameResignable(game2.getGamefile()) ? translations["onlinegame"]["auto_resigning_in"] : translations["onlinegame"]["auto_aborting_in"];
      if (!afk.timeWeLoseFromAFK) statustext2.showStatusForDuration(`${opponent_disconnectedOrLostConnection} ${resigningOrAborting} ${secsRemaining}...`, 1e3);
      const nextSecsRemaining = secsRemaining - 1;
      if (nextSecsRemaining === 0) return;
      const timeRemainUntilDisconnectLoss = disconnect.timeOpponentLoseFromDisconnect - Date.now();
      const timeToPlayNextDisplayOpponentDisconnect = timeRemainUntilDisconnectLoss - nextSecsRemaining * 1e3;
      disconnect.displayOpponentDisconnectTimeoutID = setTimeout(displayOpponentDisconnect, timeToPlayNextDisplayOpponentDisconnect, nextSecsRemaining, wasByChoice);
    }
    function handleJoinGame(message) {
      const subs = websocket.getSubs();
      subs.invites = false;
      subs.game = true;
      inSync = true;
      guititle.close();
      guiplay.close();
      guiplay.startOnlineGame(message);
    }
    function handleOpponentsMove(message) {
      if (!inOnlineGame) return;
      const moveAndConclusion = { move: message.move, gameConclusion: message.gameConclusion };
      const gamefile2 = game2.getGamefile();
      const expectedMoveNumber = gamefile2.moves.length + 1;
      if (message.moveNumber !== expectedMoveNumber) {
        console.log(`We have desynced from the game. Resyncing... Expected opponent's move number: ${expectedMoveNumber}. Actual: ${message.moveNumber}. Opponent's whole move: ${JSON.stringify(moveAndConclusion)}`);
        return resyncToGame();
      }
      let move;
      try {
        move = formatconverter.ShortToLong_CompactMove(message.move);
      } catch {
        console.error(`Opponent's move is illegal because it isn't in the correct format. Reporting... Move: ${JSON.stringify(message.move)}`);
        const reason = "Incorrectly formatted.";
        return reportOpponentsMove(reason);
      }
      const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile2, move, message.gameConclusion);
      if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${JSON.stringify(moveAndConclusion)}`);
      if (moveIsLegal !== true && !isPrivate) return reportOpponentsMove(moveIsLegal);
      movepiece.forwardToFront(gamefile2, { flipTurn: false, animateLastMove: false, updateProperties: false });
      const piecemoved = gamefileutility2.getPieceAtCoords(gamefile2, move.startCoords);
      const legalMoves = legalmoves.calculate(gamefile2, piecemoved);
      const endCoordsToAppendSpecial = math2.deepCopyObject(move.endCoords);
      legalmoves.checkIfMoveLegal(legalMoves, move.startCoords, endCoordsToAppendSpecial);
      move.type = piecemoved.type;
      specialdetect.transferSpecialFlags_FromCoordsToMove(endCoordsToAppendSpecial, move);
      movepiece.makeMove(gamefile2, move);
      selection2.reselectPiece();
      clock.edit(message.timerWhite, message.timerBlack, message.timeNextPlayerLosesAt);
      if (gamefileutility2.isGameOver(gamefile2)) gamefileutility2.concludeGame(gamefile2);
      rescheduleAlertServerWeAFK();
      stopOpponentAFKCountdown();
      flashTabNameYOUR_MOVE(true);
      scheduleMoveSound_timeoutID();
      guipause.onReceiveOpponentsMove();
    }
    function flashTabNameYOUR_MOVE(on) {
      if (!loadbalancer.isPageHidden()) return document.title = tabNameFlash.originalDocumentTitle;
      document.title = on ? "YOUR MOVE" : tabNameFlash.originalDocumentTitle;
      tabNameFlash.timeoutID = setTimeout(flashTabNameYOUR_MOVE, 1500, !on);
    }
    function cancelFlashTabTimer() {
      document.title = tabNameFlash.originalDocumentTitle;
      clearTimeout(tabNameFlash.timeoutID);
      tabNameFlash.timeoutID = void 0;
    }
    function scheduleMoveSound_timeoutID() {
      if (!loadbalancer.isPageHidden()) return;
      if (!movesscript2.isGameResignable(game2.getGamefile())) return;
      const timeNextFlashFromNow = afk.timeUntilAFKSecs * 1e3 / 2;
      tabNameFlash.moveSound_timeoutID = setTimeout(() => {
        sound.playSound_move(0);
      }, timeNextFlashFromNow);
    }
    function cancelMoveSound() {
      clearTimeout(tabNameFlash.moveSound_timeoutID);
      tabNameFlash.moveSound_timeoutID = void 0;
    }
    function resyncToGame() {
      if (!inOnlineGame) return;
      function onReplyFunc() {
        inSync = true;
      }
      websocket.sendmessage("game", "resync", gameID, false, onReplyFunc);
    }
    function handleServerGameUpdate(messageContents) {
      if (!inOnlineGame) return;
      const gamefile2 = game2.getGamefile();
      const claimedGameConclusion = messageContents.gameConclusion;
      if (!synchronizeMovesList(gamefile2, messageContents.moves, claimedGameConclusion)) {
        stopOpponentAFKCountdown();
        return;
      }
      guigameinfo.updateWhosTurn(gamefile2);
      if (messageContents.autoAFKResignTime && !isItOurTurn()) startOpponentAFKCountdown(messageContents.autoAFKResignTime);
      else stopOpponentAFKCountdown();
      if (messageContents.disconnect) startOpponentDisconnectCountdown(messageContents.disconnect);
      else stopOpponentDisconnectCountdown();
      if (messageContents.serverRestartingAt) initServerRestart(messageContents.serverRestartingAt);
      else resetServerRestarting();
      drawoffers.set(messageContents.drawOffer);
      gamefile2.gameConclusion = claimedGameConclusion;
      clock.edit(messageContents.timerWhite, messageContents.timerBlack, messageContents.timeNextPlayerLosesAt);
      if (gamefileutility2.isGameOver(gamefile2)) gamefileutility2.concludeGame(gamefile2);
    }
    function synchronizeMovesList(gamefile2, moves, claimedGameConclusion) {
      const hasOneMoreMoveThanServer = gamefile2.moves.length === moves.length + 1;
      const finalMoveIsOurMove = gamefile2.moves.length > 0 && movesscript2.getColorThatPlayedMoveIndex(gamefile2, gamefile2.moves.length - 1) === ourColor;
      const previousMoveMatches = moves.length === 0 && gamefile2.moves.length === 1 || gamefile2.moves.length > 1 && moves.length > 0 && gamefile2.moves[gamefile2.moves.length - 2].compact === moves[moves.length - 1];
      if (!claimedGameConclusion && hasOneMoreMoveThanServer && finalMoveIsOurMove && previousMoveMatches) {
        console.log("Sending our move again after resyncing..");
        return sendMove();
      }
      const originalMoveIndex = gamefile2.moveIndex;
      movepiece.forwardToFront(gamefile2, { flipTurn: false, animateLastMove: false, updateProperties: false });
      let aChangeWasMade = false;
      while (gamefile2.moves.length > moves.length) {
        movepiece.rewindMove(gamefile2, { animate: false });
        console.log("Rewound one move while resyncing to online game.");
        aChangeWasMade = true;
      }
      let i = moves.length - 1;
      while (true) {
        if (i === -1) break;
        const thisGamefileMove = gamefile2.moves[i];
        if (thisGamefileMove) {
          if (thisGamefileMove.compact === moves[i]) break;
          movepiece.rewindMove(gamefile2, { animate: false });
          console.log("Rewound one INCORRECT move while resyncing to online game.");
          aChangeWasMade = true;
        }
        i--;
      }
      const opponentColor = getOpponentColor(ourColor);
      while (i < moves.length - 1) {
        i++;
        const thisShortmove = moves[i];
        const move = movepiece.calculateMoveFromShortmove(gamefile2, thisShortmove);
        const colorThatPlayedThisMove = movesscript2.getColorThatPlayedMoveIndex(gamefile2, i);
        const opponentPlayedThisMove = colorThatPlayedThisMove === opponentColor;
        if (opponentPlayedThisMove) {
          const moveIsLegal = legalmoves.isOpponentsMoveLegal(gamefile2, move, claimedGameConclusion);
          if (moveIsLegal !== true) console.log(`Buddy made an illegal play: ${thisShortmove} ${claimedGameConclusion}`);
          if (moveIsLegal !== true && !isPrivate) {
            reportOpponentsMove(moveIsLegal);
            return false;
          }
          rescheduleAlertServerWeAFK();
          stopOpponentAFKCountdown();
          flashTabNameYOUR_MOVE();
          scheduleMoveSound_timeoutID();
        } else cancelFlashTabTimer();
        const isLastMove = i === moves.length - 1;
        movepiece.makeMove(gamefile2, move, { doGameOverChecks: isLastMove, concludeGameIfOver: false, animate: isLastMove });
        console.log("Forwarded one move while resyncing to online game.");
        aChangeWasMade = true;
      }
      if (!aChangeWasMade) movepiece.rewindGameToIndex(gamefile2, originalMoveIndex, { removeMove: false });
      else selection2.reselectPiece();
      return true;
    }
    function reportOpponentsMove(reason) {
      const opponentsMoveNumber = game2.getGamefile().moves.length + 1;
      const message = {
        reason,
        opponentsMoveNumber
      };
      websocket.sendmessage("game", "report", message);
    }
    function setColorAndGameID(gameOptions) {
      inOnlineGame = true;
      ourColor = gameOptions.youAreColor;
      gameID = gameOptions.id;
      isPrivate = gameOptions.publicity === "private";
      gameHasConcluded = false;
    }
    function initOnlineGame(gameOptions) {
      rescheduleAlertServerWeAFK();
      if (gameOptions.autoAFKResignTime) startOpponentAFKCountdown(gameOptions.autoAFKResignTime);
      if (gameOptions.disconnect) startOpponentDisconnectCountdown(gameOptions.disconnect);
      if (isItOurTurn()) {
        flashTabNameYOUR_MOVE(true);
        scheduleMoveSound_timeoutID();
      }
      if (gameOptions.serverRestartingAt) initServerRestart(gameOptions.serverRestartingAt);
      perspective2.resetRotations();
    }
    function closeOnlineGame() {
      inOnlineGame = false;
      gameID = void 0;
      isPrivate = void 0;
      ourColor = void 0;
      inSync = false;
      gameHasConcluded = void 0;
      resetAFKValues();
      resetServerRestarting();
      cancelFlashTabTimer();
      perspective2.resetRotations();
      drawoffers.reset();
    }
    function resetAFKValues() {
      cancelAFKTimer();
      tabNameFlash.timeoutID = void 0;
      afk.timeoutID = void 0, afk.timeWeLoseFromAFK = void 0;
      afk.displayAFKTimeoutID = void 0, afk.playStaccatoTimeoutID = void 0, afk.displayOpponentAFKTimeoutID = void 0, afk.timeOpponentLoseFromAFK = void 0;
    }
    function isItOurTurn() {
      return game2.getGamefile().whosTurn === ourColor;
    }
    function areWeColor(color) {
      return color === ourColor;
    }
    function sendMove() {
      if (!inOnlineGame || !inSync) return;
      if (main.devBuild) console.log("Sending our move..");
      const gamefile2 = game2.getGamefile();
      const shortmove = movesscript2.getLastMove(gamefile2.moves).compact;
      const data = {
        move: shortmove,
        moveNumber: gamefile2.moves.length,
        gameConclusion: gamefile2.gameConclusion
      };
      websocket.sendmessage("game", "submitmove", data, true);
      drawoffers.callback_declineDraw({ informServer: false });
      rescheduleAlertServerWeAFK();
    }
    function onMainMenuPress() {
      if (!inOnlineGame) return;
      const gamefile2 = game2.getGamefile();
      if (gameHasConcluded) {
        if (websocket.getSubs().game) {
          websocket.sendmessage("general", "unsub", "game");
          websocket.getSubs().game = false;
        }
        return;
      }
      if (movesscript2.isGameResignable(gamefile2)) resign();
      else abort();
    }
    function resign() {
      websocket.getSubs().game = false;
      inSync = false;
      websocket.sendmessage("game", "resign");
    }
    function abort() {
      websocket.getSubs().game = false;
      inSync = false;
      websocket.sendmessage("game", "abort");
    }
    function getOpponentColor() {
      return math2.getOppositeColor(ourColor);
    }
    async function askServerIfWeAreInGame() {
      await memberHeader.waitUntilInitialRequestBack();
      const messageContents = void 0;
      websocket.sendmessage("game", "joingame", messageContents, true);
    }
    function requestRemovalFromPlayersInActiveGames() {
      if (!inOnlineGame) return;
      websocket.sendmessage("game", "removefromplayersinactivegames");
    }
    function initServerRestart(timeToRestart) {
      if (serverRestart.time === timeToRestart) return;
      resetServerRestarting();
      serverRestart.time = timeToRestart;
      const timeRemain = timeToRestart - Date.now();
      const minutesLeft = Math.ceil(timeRemain / (1e3 * 60));
      console.log(`Server has informed us it is restarting in ${minutesLeft} minutes!`);
      displayServerRestarting(minutesLeft);
    }
    function displayServerRestarting(minutesLeft) {
      if (minutesLeft === 0) {
        statustext2.showStatus(translations["onlinegame"]["server_restarting"], false, 2);
        serverRestart.time = false;
        return;
      }
      const minutes_plurality = minutesLeft === 1 ? translations["onlinegame"]["minute"] : translations["onlinegame"]["minutes"];
      statustext2.showStatus(`${translations["onlinegame"]["server_restarting_in"]} ${minutesLeft} ${minutes_plurality}...`, false, 2);
      let nextKeyMinute;
      for (const keyMinute of serverRestart.keyMinutes) {
        if (keyMinute < minutesLeft) {
          nextKeyMinute = keyMinute;
          break;
        }
      }
      const timeToDisplayNextServerRestart = serverRestart.time - nextKeyMinute * 60 * 1e3;
      const timeUntilDisplayNextServerRestart = timeToDisplayNextServerRestart - Date.now();
      serverRestart.timeoutID = setTimeout(displayServerRestarting, timeUntilDisplayNextServerRestart, nextKeyMinute);
    }
    function resetServerRestarting() {
      serverRestart.time = false;
      clearTimeout(serverRestart.timeoutID);
      serverRestart.timeoutID = void 0;
    }
    function deleteCustomVariantOptions() {
      if (isPrivate) localstorage2.deleteItem(gameID);
    }
    function onGameConclude() {
      gameHasConcluded = true;
      cancelAFKTimer();
      cancelFlashTabTimer();
      cancelMoveSound();
      resetServerRestarting();
      deleteCustomVariantOptions();
      drawoffers.reset();
    }
    return Object.freeze({
      onmessage,
      areInOnlineGame,
      getIsPrivate,
      getOurColor,
      setInSyncFalse,
      setColorAndGameID,
      initOnlineGame,
      closeOnlineGame,
      isItOurTurn,
      areWeColor,
      sendMove,
      onMainMenuPress,
      getGameID,
      askServerIfWeAreInGame,
      requestRemovalFromPlayersInActiveGames,
      resyncToGame,
      update,
      onLostConnection,
      cancelMoveSound,
      onGameConclude,
      hasGameConcluded
    });
  }();

  // src/client/scripts/game/gui/guipause.mjs
  var guipause2 = function() {
    let isPaused = false;
    const element_pauseUI = document.getElementById("pauseUI");
    const element_resume = document.getElementById("resume");
    const element_pointers = document.getElementById("togglepointers");
    const element_copygame = document.getElementById("copygame");
    const element_pastegame = document.getElementById("pastegame");
    const element_mainmenu = document.getElementById("mainmenu");
    const element_offerDraw = document.getElementById("offerdraw");
    const element_perspective = document.getElementById("toggleperspective");
    function areWePaused() {
      return isPaused;
    }
    function getelement_perspective() {
      return element_perspective;
    }
    function open() {
      isPaused = true;
      updateTextOfMainMenuButton();
      updatePasteButtonTransparency();
      updateDrawOfferButton();
      style.revealElement(element_pauseUI);
      initListeners();
    }
    function toggle() {
      if (!isPaused) open();
      else callback_Resume();
    }
    function updatePasteButtonTransparency() {
      const moves = game2.getGamefile().moves;
      const legalInPrivateMatch = onlinegame2.getIsPrivate() && moves.length === 0;
      if (onlinegame2.areInOnlineGame() && !legalInPrivateMatch) element_pastegame.classList.add("opacity-0_5");
      else element_pastegame.classList.remove("opacity-0_5");
    }
    function updateDrawOfferButton() {
      if (!isPaused) return;
      if (drawoffers.areWeAcceptingDraw()) {
        element_offerDraw.innerText = translations.accept_draw;
        element_offerDraw.classList.remove("opacity-0_5");
        return;
      } else element_offerDraw.innerText = translations.offer_draw;
      if (drawoffers.isOfferingDrawLegal()) element_offerDraw.classList.remove("opacity-0_5");
      else element_offerDraw.classList.add("opacity-0_5");
    }
    function onReceiveOpponentsMove() {
      updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable: true });
      updateDrawOfferButton();
    }
    function updateTextOfMainMenuButton({ freezeResignButtonIfNoLongerAbortable } = {}) {
      if (!isPaused) return;
      if (!onlinegame2.areInOnlineGame() || onlinegame2.hasGameConcluded()) return element_mainmenu.textContent = translations["main_menu"];
      if (movesscript.isGameResignable(game2.getGamefile())) {
        if (freezeResignButtonIfNoLongerAbortable && element_mainmenu.textContent === translations["abort_game"]) {
          element_mainmenu.disabled = true;
          element_mainmenu.classList.add("opacity-0_5");
          setTimeout(() => {
            element_mainmenu.disabled = false;
            element_mainmenu.classList.remove("opacity-0_5");
          }, 1e3);
        }
        element_mainmenu.textContent = translations["resign_game"];
        return;
      }
      element_mainmenu.textContent = translations["abort_game"];
    }
    function initListeners() {
      element_resume.addEventListener("click", callback_Resume);
      element_pointers.addEventListener("click", callback_TogglePointers);
      element_copygame.addEventListener("click", copypastegame.callbackCopy);
      element_pastegame.addEventListener("click", copypastegame.callbackPaste);
      element_mainmenu.addEventListener("click", callback_MainMenu);
      element_offerDraw.addEventListener("click", callback_OfferDraw);
      element_perspective.addEventListener("click", callback_Perspective);
    }
    function closeListeners() {
      element_resume.removeEventListener("click", callback_Resume);
      element_pointers.removeEventListener("click", callback_TogglePointers);
      element_copygame.removeEventListener("click", copypastegame.callbackCopy);
      element_pastegame.removeEventListener("click", copypastegame.callbackPaste);
      element_mainmenu.removeEventListener("click", callback_MainMenu);
      element_offerDraw.removeEventListener("click", callback_OfferDraw);
      element_perspective.removeEventListener("click", callback_Perspective);
    }
    function callback_Resume() {
      if (!isPaused) return;
      isPaused = false;
      style.hideElement(element_pauseUI);
      closeListeners();
      main2.renderThisFrame();
    }
    function callback_MainMenu() {
      onlinegame2.onMainMenuPress();
      onlinegame2.closeOnlineGame();
      callback_Resume();
      game2.unloadGame();
      clock.reset();
      guinavigation.close();
      guititle.open();
    }
    function callback_OfferDraw() {
      if (drawoffers.areWeAcceptingDraw()) {
        drawoffers.callback_AcceptDraw();
        callback_Resume();
        return;
      }
      if (drawoffers.isOfferingDrawLegal()) {
        drawoffers.extendOffer();
        callback_Resume();
        return;
      }
      statustext2.showStatus("Can't offer draw.");
    }
    function callback_TogglePointers() {
      main2.renderThisFrame();
      let mode = arrows.getMode();
      mode++;
      if (mode > 2) mode = 0;
      arrows.setMode(mode);
      const text = mode === 0 ? translations["arrows_off"] : mode === 1 ? translations["arrows_defense"] : translations["arrows_all"];
      element_pointers.textContent = text;
      if (!isPaused) statustext2.showStatus(translations["toggled"] + " " + text);
    }
    function callback_Perspective() {
      perspective.toggle();
    }
    return Object.freeze({
      areWePaused,
      getelement_perspective,
      open,
      toggle,
      updateDrawOfferButton,
      onReceiveOpponentsMove,
      updateTextOfMainMenuButton,
      callback_Resume,
      callback_TogglePointers
    });
  }();

  // src/client/scripts/game/rendering/perspective.mjs
  var perspective2 = function() {
    let enabled = false;
    let rotX = 0;
    let rotZ = 0;
    let isViewingBlackPerspective = false;
    const mouseSensitivity = 0.13;
    const distToRenderBoard = 1500;
    const viewRange = 1e3;
    const crosshairThickness = 2.5;
    const crosshairWidth = 18;
    const crosshairColor = [1, 1, 1, 1];
    let crosshairModel;
    function getEnabled() {
      return enabled;
    }
    function getRotX() {
      return rotX;
    }
    function getRotZ() {
      return rotZ;
    }
    function getIsViewingBlackPerspective() {
      return isViewingBlackPerspective;
    }
    function toggle() {
      if (!input.isMouseSupported()) return statustext2.showStatus(translations["rendering"]["perspective_mode_on_desktop"]);
      if (!enabled) enable();
      else disable();
    }
    function enable() {
      if (enabled) return console.error("Should not be enabling perspective when it is already enabled.");
      enabled = true;
      guipause2.getelement_perspective().textContent = `${translations["rendering"]["perspective"]}: ${translations["rendering"]["on"]}`;
      guipause2.callback_Resume();
      lockMouse();
      board2.initDarkTilesModel();
      initCrosshairModel();
      piecesmodel.initRotatedPiecesModel(game.getGamefile());
      statustext2.showStatus(translations["rendering"]["movement_tutorial"]);
    }
    function disable() {
      if (!enabled) return;
      main2.renderThisFrame();
      enabled = false;
      main2.enableForceRender();
      guipause2.callback_Resume();
      guipause2.getelement_perspective().textContent = `${translations["rendering"]["perspective"]}: ${translations["rendering"]["off"]}`;
      resetRotations();
      board2.initDarkTilesModel();
      piecesmodel.eraseRotatedModel(game.getGamefile());
    }
    function resetRotations() {
      rotX = 0;
      rotZ = onlinegame.getOurColor() === "black" ? 180 : 0;
      updateIsViewingBlackPerspective();
      camera2.onPositionChange();
    }
    function relockMouse() {
      if (!enabled) return;
      if (isMouseLocked()) return;
      if (guipause2.areWePaused()) return;
      if (selection.isPawnCurrentlyPromoting()) return;
      lockMouse();
    }
    function lockMouse() {
      camera2.canvas.requestPointerLock();
    }
    function update(mouseChangeInX, mouseChangeInY) {
      if (!enabled) return;
      if (!isMouseLocked()) return;
      rotX += mouseChangeInY * mouseSensitivity;
      rotZ += mouseChangeInX * mouseSensitivity;
      capRotations();
      updateIsViewingBlackPerspective();
      camera2.onPositionChange();
    }
    function applyRotations(viewMatrix) {
      if (haveZeroRotation()) return;
      const cameraPos = camera2.getPosition();
      mat4.translate(viewMatrix, viewMatrix, cameraPos);
      if (rotX < 0) {
        const rotXRad = rotX * (Math.PI / 180);
        mat4.rotate(viewMatrix, viewMatrix, rotXRad, [1, 0, 0]);
      }
      const rotZRad = rotZ * (Math.PI / 180);
      mat4.rotate(viewMatrix, viewMatrix, rotZRad, [0, 0, 1]);
      const negativeCameraPos = [-cameraPos[0], -cameraPos[1], -cameraPos[2]];
      mat4.translate(viewMatrix, viewMatrix, negativeCameraPos);
    }
    function haveZeroRotation() {
      return rotX === 0 && rotZ === 0;
    }
    function isLookingUp() {
      return enabled && rotX <= -90;
    }
    function capRotations() {
      if (rotX > 0) rotX = 0;
      else if (rotX < -180) rotX = -180;
      if (rotZ < 0) rotZ += 360;
      else if (rotZ > 360) rotZ -= 360;
    }
    function isMouseLocked() {
      return document.pointerLockElement === camera2.canvas || document.mozPointerLockElement === camera2.canvas || document.webkitPointerLockElement === camera2.canvas;
    }
    function initCrosshairModel() {
      if (!enabled) return;
      const cameraZ = camera2.getPosition()[2];
      const innerSide = crosshairThickness * cameraZ / camera2.getCanvasHeightVirtualPixels();
      const outerSide = crosshairWidth * cameraZ / camera2.getCanvasHeightVirtualPixels();
      const [r, g, b, a] = crosshairColor;
      const data = new Float32Array([
        //       Vertex         Color
        //              MEDICAL PLUS sign cross hair
        // Horz bar
        -outerSide,
        -innerSide,
        r,
        g,
        b,
        a,
        -outerSide,
        innerSide,
        r,
        g,
        b,
        a,
        outerSide,
        innerSide,
        r,
        g,
        b,
        a,
        outerSide,
        innerSide,
        r,
        g,
        b,
        a,
        outerSide,
        -innerSide,
        r,
        g,
        b,
        a,
        -outerSide,
        -innerSide,
        r,
        g,
        b,
        a,
        // Vert bar
        -innerSide,
        -outerSide,
        r,
        g,
        b,
        a,
        -innerSide,
        outerSide,
        r,
        g,
        b,
        a,
        innerSide,
        outerSide,
        r,
        g,
        b,
        a,
        innerSide,
        outerSide,
        r,
        g,
        b,
        a,
        innerSide,
        -outerSide,
        r,
        g,
        b,
        a,
        -innerSide,
        -outerSide,
        r,
        g,
        b,
        a,
        -outerSide,
        -innerSide,
        r,
        g,
        b,
        a
        //              CROSS crosshair
        // Horz bar
        //     -outerSide, -innerSide,       r, g, b, a,
        //     -outerSide,  innerSide,       r, g, b, a,
        //     outerSide,  innerSide,        r, g, b, a,
        //     outerSide,  innerSide,        r, g, b, a,
        //     outerSide,  -innerSide,       r, g, b, a,
        //     -outerSide,  -innerSide,      r, g, b, a,
        // // Vert bar, top half
        //     -innerSide, innerSide,       r, g, b, a,
        //     -innerSide,  outerSide,       r, g, b, a,
        //     innerSide,  outerSide,        r, g, b, a,
        //     innerSide,  outerSide,        r, g, b, a,
        //     innerSide,  innerSide,       r, g, b, a,
        //     -innerSide,  innerSide,      r, g, b, a,
        //     // Vert bar, bottom half
        //     -innerSide, -innerSide,       r, g, b, a,
        //     -innerSide,  -outerSide,       r, g, b, a,
        //     innerSide,  -outerSide,        r, g, b, a,
        //     innerSide,  -outerSide,        r, g, b, a,
        //     innerSide,  -innerSide,       r, g, b, a,
        //     -innerSide,  -innerSide,      r, g, b, a,
      ]);
      crosshairModel = buffermodel.createModel_Colored(data, 2, "TRIANGLES");
    }
    function renderCrosshair() {
      if (!enabled) return;
      if (main2.videoMode) return;
      if (crosshairModel == null) return console.error("Crosshair model is null but it should have been defined when toggling on perspective!");
      const perspectiveViewMatrixCopy = camera2.getViewMatrix();
      camera2.initViewMatrix(true);
      webgl.executeWithInverseBlending(() => {
        crosshairModel.render();
      });
      camera2.setViewMatrix(perspectiveViewMatrixCopy);
    }
    function unlockMouse() {
      if (!enabled) return;
      document.exitPointerLock();
    }
    function updateIsViewingBlackPerspective() {
      isViewingBlackPerspective = rotZ > 90 && rotZ < 270;
    }
    return Object.freeze({
      getEnabled,
      getRotX,
      getRotZ,
      distToRenderBoard,
      viewRange,
      getIsViewingBlackPerspective,
      toggle,
      disable,
      resetRotations,
      relockMouse,
      update,
      applyRotations,
      isMouseLocked,
      renderCrosshair,
      unlockMouse,
      isLookingUp,
      initCrosshairModel
    });
  }();

  // src/client/scripts/game/rendering/camera.mjs
  var camera2 = function() {
    const position = [0, 0, 12];
    const position_devMode = [0, 0, 18];
    const fieldOfView = 90 * Math.PI / 180;
    const zNear = 1;
    const zFar = 1500 * Math.SQRT2;
    const MARGIN_OF_HEADER_AND_FOOTER = 40;
    const pixelDensity = window.devicePixelRatio;
    let PIXEL_HEIGHT_OF_TOP_NAV = void 0;
    let PIXEL_HEIGHT_OF_BOTTOM_NAV = void 0;
    const canvas = document.getElementById("game");
    let canvasWidthVirtualPixels;
    let canvasHeightVirtualPixels;
    let canvasRect;
    let aspect;
    let screenBoundingBox;
    let screenBoundingBox_devMode;
    let projectionMatrix;
    let viewMatrix;
    function getPosition(ignoreDevmode) {
      return math2.deepCopyObject(!ignoreDevmode && options2.isDebugModeOn() ? position_devMode : position);
    }
    function getZFar() {
      return zFar;
    }
    function getPixelDensity() {
      return pixelDensity;
    }
    function getPIXEL_HEIGHT_OF_TOP_NAV() {
      return PIXEL_HEIGHT_OF_TOP_NAV;
    }
    function getPIXEL_HEIGHT_OF_BOTTOM_NAV() {
      return PIXEL_HEIGHT_OF_BOTTOM_NAV;
    }
    function getCanvasWidthVirtualPixels() {
      return canvasWidthVirtualPixels;
    }
    function getCanvasHeightVirtualPixels() {
      return canvasHeightVirtualPixels;
    }
    function getCanvasRect() {
      return math2.deepCopyObject(canvasRect);
    }
    function getScreenBoundingBox(devMode) {
      return math2.deepCopyObject(devMode ? screenBoundingBox_devMode : screenBoundingBox);
    }
    function getViewMatrix() {
      return math2.copyFloat32Array(viewMatrix);
    }
    function init() {
      initMatrixes();
      canvasRect = canvas.getBoundingClientRect();
    }
    function initMatrixes() {
      projectionMatrix = mat4.create();
      initPerspective();
      initViewMatrix();
    }
    function initPerspective() {
      updateCanvasDimensions();
      initProjMatrix();
    }
    function updateCanvasDimensions() {
      canvasWidthVirtualPixels = window.innerWidth;
      canvasHeightVirtualPixels = window.innerHeight - MARGIN_OF_HEADER_AND_FOOTER;
      canvas.width = canvasWidthVirtualPixels * pixelDensity;
      canvas.height = canvasHeightVirtualPixels * pixelDensity;
      gl.viewport(0, 0, canvas.width, canvas.height);
      updatePIXEL_HEIGHT_OF_NAVS();
      recalcCanvasVariables();
    }
    function updatePIXEL_HEIGHT_OF_NAVS() {
      PIXEL_HEIGHT_OF_TOP_NAV = !options2.gnavigationVisible() ? 0 : window.innerWidth > 700 ? 84 : window.innerWidth > 550 ? window.innerWidth * 0.12 : window.innerWidth > 368 ? 66 : window.innerWidth * 0.179;
      PIXEL_HEIGHT_OF_BOTTOM_NAV = !options2.gnavigationVisible() ? 0 : 84;
      main2.renderThisFrame();
      stats.updateStatsCSS();
    }
    function recalcCanvasVariables() {
      aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
      initScreenBoundingBox();
      game2.updateVariablesAfterScreenResize();
      miniimage.recalcWidthWorld();
    }
    function setViewMatrix(newMatrix) {
      viewMatrix = newMatrix;
      sendViewMatrixToGPU();
    }
    function initViewMatrix(ignoreRotations) {
      const newViewMatrix = mat4.create();
      const cameraPos = getPosition();
      mat4.lookAt(newViewMatrix, cameraPos, [0, 0, 0], [0, 1, 0]);
      if (!ignoreRotations) perspective2.applyRotations(newViewMatrix);
      viewMatrix = newViewMatrix;
      sendViewMatrixToGPU();
    }
    function sendViewMatrixToGPU() {
      for (const programName in shaders.programs) {
        const program = shaders.programs[programName];
        const viewMatrixLocation = program.uniformLocations.viewMatrix;
        if (viewMatrixLocation == null) continue;
        gl.useProgram(program.program);
        gl.uniformMatrix4fv(viewMatrixLocation, false, viewMatrix);
      }
    }
    function initProjMatrix() {
      mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
      for (const programName in shaders.programs) {
        const program = shaders.programs[programName];
        const projMatrixLocation = program.uniformLocations.projectionMatrix;
        if (projMatrixLocation == null) continue;
        gl.useProgram(program.program);
        gl.uniformMatrix4fv(projMatrixLocation, gl.FALSE, projectionMatrix);
      }
    }
    function initScreenBoundingBox() {
      let dist = position[2];
      const thetaY = fieldOfView / 2;
      let distToVertEdge = Math.tan(thetaY) * dist;
      let distToHorzEdge = distToVertEdge * aspect;
      screenBoundingBox = {
        left: -distToHorzEdge,
        right: distToHorzEdge,
        bottom: -distToVertEdge,
        top: distToVertEdge
      };
      dist = position_devMode[2];
      distToVertEdge = Math.tan(thetaY) * dist;
      distToHorzEdge = distToVertEdge * aspect;
      screenBoundingBox_devMode = {
        left: -distToHorzEdge,
        right: distToHorzEdge,
        bottom: -distToVertEdge,
        top: distToVertEdge
      };
    }
    function onScreenResize() {
      initPerspective();
      perspective2.initCrosshairModel();
      main2.renderThisFrame();
      guidrawoffer.updateVisibilityOfNamesAndClocksWithDrawOffer();
    }
    function onPositionChange() {
      initViewMatrix();
    }
    return Object.freeze({
      getPosition,
      getPixelDensity,
      getPIXEL_HEIGHT_OF_TOP_NAV,
      getPIXEL_HEIGHT_OF_BOTTOM_NAV,
      canvas,
      getCanvasWidthVirtualPixels,
      getCanvasHeightVirtualPixels,
      getCanvasRect,
      getScreenBoundingBox,
      getViewMatrix,
      init,
      updatePIXEL_HEIGHT_OF_NAVS,
      setViewMatrix,
      onScreenResize,
      onPositionChange,
      initViewMatrix,
      getZFar
    });
  }();

  // src/client/scripts/game/rendering/webgl.mjs
  var gl;
  var webgl = function() {
    let clearColor = [0.5, 0.5, 0.5];
    const defaultDepthFuncParam = "LEQUAL";
    const useWebGL2 = false;
    const culling = false;
    const frontFaceVerticesAreClockwise = true;
    function setClearColor(newClearColor) {
      clearColor = newClearColor;
    }
    function init() {
      if (useWebGL2) {
        gl = camera2.canvas.getContext("webgl2", { alpha: false });
        if (!gl) console.log("Browser doesn't support WebGL-2, falling back to WebGL-1.");
      }
      if (!gl) {
        gl = camera2.canvas.getContext("webgl", { alpha: false });
      }
      if (!gl) {
        console.log("Browser doesn't support WebGL-1, falling back on experiment-webgl.");
        gl = camera2.canvas.getContext("experimental-webgl", { alpha: false });
      }
      if (!gl) {
        alert(translations["webgl_unsupported"]);
        throw new Error("WebGL not supported.");
      }
      gl.clearDepth(1);
      clearScreen();
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl[defaultDepthFuncParam]);
      gl.enable(gl.BLEND);
      toggleNormalBlending();
      if (culling) {
        gl.enable(gl.CULL_FACE);
        const dir = frontFaceVerticesAreClockwise ? gl.CW : gl.CCW;
        gl.frontFace(dir);
        gl.cullFace(gl.BACK);
      }
    }
    function clearScreen() {
      gl.clearColor(...clearColor, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    function toggleNormalBlending() {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    function toggleInverseBlending() {
      gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.GL_ZERO);
    }
    function executeWithDepthFunc_ALWAYS(func, ...args) {
      gl.depthFunc(gl.ALWAYS);
      func(...args);
      gl.depthFunc(gl[defaultDepthFuncParam]);
    }
    function executeWithInverseBlending(func) {
      toggleInverseBlending();
      func();
      toggleNormalBlending();
    }
    function queryWebGLContextInfo() {
      const params = [
        { name: "MAX_TEXTURE_SIZE", desc: "Maximum texture size", guaranteed: 64 },
        { name: "MAX_CUBE_MAP_TEXTURE_SIZE", desc: "Maximum cube map texture size", guaranteed: 16 },
        { name: "MAX_RENDERBUFFER_SIZE", desc: "Maximum renderbuffer size", guaranteed: 1 },
        { name: "MAX_TEXTURE_IMAGE_UNITS", desc: "Maximum texture units for fragment shader", guaranteed: 8 },
        { name: "MAX_VERTEX_TEXTURE_IMAGE_UNITS", desc: "Maximum texture units for vertex shader", guaranteed: 0 },
        { name: "MAX_COMBINED_TEXTURE_IMAGE_UNITS", desc: "Maximum combined texture units", guaranteed: 8 },
        { name: "MAX_VERTEX_ATTRIBS", desc: "Maximum vertex attributes", guaranteed: 8 },
        { name: "MAX_VERTEX_UNIFORM_VECTORS", desc: "Maximum vertex uniform vectors", guaranteed: 128 },
        { name: "MAX_FRAGMENT_UNIFORM_VECTORS", desc: "Maximum fragment uniform vectors", guaranteed: 16 },
        { name: "MAX_VARYING_VECTORS", desc: "Maximum varying vectors", guaranteed: 8 },
        { name: "MAX_VIEWPORT_DIMS", desc: "Maximum viewport dimensions", guaranteed: [0, 0] },
        { name: "ALIASED_POINT_SIZE_RANGE", desc: "Aliased point size range", guaranteed: [1, 1] },
        { name: "ALIASED_LINE_WIDTH_RANGE", desc: "Aliased line width range", guaranteed: [1, 1] },
        { name: "MAX_VERTEX_UNIFORM_COMPONENTS", desc: "Maximum vertex uniform components", guaranteed: 1024 },
        { name: "MAX_FRAGMENT_UNIFORM_COMPONENTS", desc: "Maximum fragment uniform components", guaranteed: 1024 },
        { name: "MAX_VERTEX_OUTPUT_COMPONENTS", desc: "Maximum vertex output components", guaranteed: 64 },
        { name: "MAX_FRAGMENT_INPUT_COMPONENTS", desc: "Maximum fragment input components", guaranteed: 60 },
        { name: "MAX_DRAW_BUFFERS", desc: "Maximum draw buffers", guaranteed: 4 },
        { name: "MAX_COLOR_ATTACHMENTS", desc: "Maximum color attachments", guaranteed: 4 },
        { name: "MAX_SAMPLES", desc: "Maximum samples", guaranteed: 4 }
      ];
      console.log("WebGL Context Information:");
      params.forEach((param) => {
        const value = gl.getParameter(gl[param.name]);
        console.log(`${param.desc}:`, value, `(Guaranteed: ${param.guaranteed})`);
      });
    }
    return Object.freeze({
      init,
      clearScreen,
      executeWithDepthFunc_ALWAYS,
      executeWithInverseBlending,
      setClearColor,
      queryWebGLContextInfo
    });
  }();

  // src/client/scripts/game/misc/browsersupport.mjs
  var browsersupport = function() {
    function checkBrowserSupport() {
    }
    function checkIfBigIntSupported() {
      try {
        BigInt(123);
      } catch (e) {
        console.error("BigInts are not supported.");
        alert(translations["bigints_unsupported"]);
        throw new Error("Browser not supported.");
      }
    }
    return Object.freeze({
      checkBrowserSupport
    });
  }();

  // src/client/scripts/game/gui/guiloading.mjs
  var guiloading = function() {
    const element_loadingAnimation = document.getElementById("loading-animation");
    const element_loadingText = document.getElementById("loading-text");
    function closeAnimation() {
      style.fadeIn1s(camera2.canvas);
      gui.fadeInOverlay1s();
      setTimeout(style.hideElement, 1e3, element_loadingAnimation);
    }
    return Object.freeze({
      closeAnimation
    });
  }();

  // src/client/scripts/game/main.mjs
  var main2 = function() {
    const GAME_VERSION = "1.4";
    const devBuild = true;
    const videoMode = false;
    let thisFrameChanged = true;
    let forceRender = false;
    let forceCalc = false;
    function renderThisFrame() {
      thisFrameChanged = true;
    }
    function enableForceRender() {
      forceRender = true;
    }
    function gforceCalc() {
      return forceCalc;
    }
    function sforceCalc(value) {
      forceCalc = value;
    }
    function start() {
      guiloading.closeAnimation();
      webgl.init();
      shaders.initPrograms();
      camera2.init();
      browsersupport.checkBrowserSupport();
      game2.init();
      initListeners();
      onlinegame2.askServerIfWeAreInGame();
      localstorage2.eraseExpiredItems();
      gameLoop();
    }
    function initListeners() {
      input2.initListeners();
      window.addEventListener("beforeunload", function() {
        websocket.closeSocket();
        memberHeader.deleteToken();
        invites.deleteInviteTagInLocalStorage();
        localstorage2.eraseExpiredItems();
      });
    }
    function gameLoop() {
      const loop = function(runtime) {
        loadbalancer2.update(runtime);
        game2.update();
        render();
        input2.resetKeyEvents();
        loadbalancer2.timeAnimationFrame();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    function render() {
      if (forceRender) thisFrameChanged = true;
      if (!thisFrameChanged) return;
      forceRender = false;
      webgl.clearScreen();
      game2.render();
      thisFrameChanged = false;
    }
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        console.log("Copied to clipboard");
      }).catch((error) => {
        console.error("Failed to copy to clipboard", error);
      });
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    return Object.freeze({
      GAME_VERSION,
      devBuild,
      videoMode,
      gforceCalc,
      // get
      renderThisFrame,
      enableForceRender,
      sforceCalc,
      // set
      start,
      copyToClipboard,
      sleep
    });
  }();

  // src/client/scripts/game/htmlscript.mjs
  var htmlscript = function() {
    let atleastOneUserGesture = false;
    let audioContextDefined = false;
    document.addEventListener("mousedown", callback_OnUserGesture);
    document.addEventListener("click", callback_OnUserGesture);
    function callback_OnUserGesture() {
      atleastOneUserGesture = true;
      document.removeEventListener("mousedown", callback_OnUserGesture);
      document.removeEventListener("click", callback_OnUserGesture);
      if (audioContextDefined) sound.getAudioContext().resume();
      else window.addEventListener("load", () => {
        if (loadingErrorOcurred) return;
        sound.getAudioContext()?.resume();
      });
    }
    (async function decodeAudioBuffer() {
      const pathToAllSoundsFile = "/sounds/soundspritesheet.mp3";
      const audioContext = new AudioContext();
      let audioDecodedBuffer;
      await fetch(pathToAllSoundsFile).then((response) => response.arrayBuffer()).then(async (arrayBuffer) => {
        await audioContext.decodeAudioData(arrayBuffer, function(decodedBuffer) {
          audioDecodedBuffer = decodedBuffer;
        });
      }).catch((error) => {
        console.error(`An error ocurred during loading of sounds: ${error.message}`);
        callback_LoadingError();
      });
      if (document.readyState === "complete") sendAudioContextToScript();
      else window.addEventListener("load", () => {
        if (loadingErrorOcurred) return;
        sound.initAudioContext(audioContext, audioDecodedBuffer);
        audioContextDefined = true;
      });
      function sendAudioContextToScript() {
        if (loadingErrorOcurred) return;
        sound.initAudioContext(audioContext, audioDecodedBuffer);
        audioContextDefined = true;
      }
    })();
    function hasUserGesturedAtleastOnce() {
      return atleastOneUserGesture;
    }
    ;
    let loadingErrorOcurred = false;
    let lostNetwork = false;
    function callback_LoadingError(event2) {
      if (loadingErrorOcurred) return;
      loadingErrorOcurred = true;
      const element_loadingText = document.getElementById("loading-text");
      element_loadingText.classList.add("hidden");
      const element_loadingError = document.getElementById("loading-error");
      const element_loadingErrorText = document.getElementById("loading-error-text");
      element_loadingError.classList.remove("hidden");
      element_loadingErrorText.textContent = lostNetwork ? translations["lost_network"] : translations["failed_to_load"];
      const element_loadingGlow = document.getElementById("loading-glow");
      element_loadingGlow.classList.remove("loadingGlowAnimation");
      element_loadingGlow.classList.add("loading-glow-error");
    }
    function removeOnerror() {
      this.onerror = null;
    }
    (function initLoadingScreenListeners() {
      window.addEventListener("offline", callback_Offline);
      window.addEventListener("online", callback_Online);
    })();
    function closeLoadingScreenListeners() {
      window.removeEventListener("offline", callback_Offline);
      window.removeEventListener("online", callback_Online);
    }
    function callback_Offline() {
      console.log("Network connection lost");
      lostNetwork = true;
      callback_LoadingError();
    }
    function callback_Online() {
      console.log("Network connection regained");
      lostNetwork = false;
      if (loadingErrorOcurred) window.location.reload();
    }
    window.addEventListener("load", function() {
      if (loadingErrorOcurred) return;
      closeLoadingScreenListeners();
      main2.start();
    });
    return Object.freeze({
      callback_LoadingError,
      removeOnerror,
      hasUserGesturedAtleastOnce
    });
  }();
})();
/*!
@fileoverview gl-matrix - High performance matrix and vector operations
@author Brandon Jones
@author Colin MacKenzie IV
@version 3.4.0

Copyright (c) 2015-2021, Brandon Jones, Colin MacKenzie IV.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
