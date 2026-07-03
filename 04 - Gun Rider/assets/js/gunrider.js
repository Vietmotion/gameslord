const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1200;
        canvas.height = 700;
        const VIEW_WIDTH = canvas.width;
        const VIEW_HEIGHT = canvas.height;
        const WORLD_WIDTH = 2400;
        const WORLD_HEIGHT = 700;

        // Game state
        const game = {
            isRunning: false,
            currentPlayer: 1,
            winner: null,
            matchStartedAtMs: 0,
            matchElapsedMs: 0,
            botThinking: false,
            botMoveTimer: 0,
            botTargetX: 0,
            botCalculatedAngle: 0,
            botCalculatedPower: 0,
            turnDelay: 0,
            waitingForTurn: false,
            cameraShake: 0,
            cameraShakeX: 0,
            cameraShakeY: 0,
            timeScale: 1,
            endSlowMo: false,
            endTimer: 0,
            maxTurnTime: 12,
            turnTimeLeft: 12,
            cameraSnap: true,
            cameraHoldX: null,
            prematchScan: {
                active: false,
                startedAt: 0,
                durationMs: 0,
                isOnlineStart: false,
                killingTimeStart: false,
                phase: 'sweep',
                returnStartedAt: 0,
                returnDurationMs: 0,
                focusPlayer: 1,
                sweepFromX: 0,
                sweepToX: 0,
                returnFromX: 0,
                returnTargetX: 0
            }
        };


            function createAudioElement(loop = false, volume = 1) {
                const audio = new Audio();
                audio.loop = loop;
                audio.volume = volume;
                audio.preload = 'auto';
                return audio;
            }

            async function loadAudioAsset(audio, assetUrl) {
                try {
                    const response = await fetch(assetUrl, { cache: 'force-cache' });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    audio.src = objectUrl;
                    audio.load();
                    return objectUrl;
                } catch (error) {
                    console.warn(`Audio preload failed for ${assetUrl}:`, error);
                    audio.src = assetUrl;
                    audio.load();
                    return assetUrl;
                }
            }
        const killingTime = {
            triggerAtMs: 120000,
            effectIntervalMs: 18000,
            active: false,
            startedAtMs: 0,
            nextEffectAtMs: 0,
            availableEffects: ['doubleDamage', 'meteors', 'risingWater', 'rapidTurns'],
            activeEffects: {
                doubleDamage: false,
                meteors: false,
                risingWater: false,
                rapidTurns: false
            },
            meteorSpawnAtMs: 0,
            meteors: [],
            waterRisePx: 0,
            waterRiseRatePerSec: 1.35,
            popupText: '',
            popupUntilMs: 0
        };

        const CHARGE_RATE_PER_TICK = 0.9;
        const SURFACE_SNAP_GRACE = 12;
        const DEATH_FADE_DURATION_MS = 700;

        function getDeathFadeAlpha(target) {
            if (!target) return 1;
            const untilMs = Number(target.deadFadeUntilMs) || 0;
            if (!untilMs) {
                return 1;
            }
            const remain = untilMs - Date.now();
            if (remain <= 0) {
                return 0;
            }
            return Math.max(0, Math.min(1, remain / DEATH_FADE_DURATION_MS));
        }

        function triggerDeathFade(target) {
            if (!target) return;
            target.deadFadeUntilMs = Date.now() + DEATH_FADE_DURATION_MS;
        }

        // Wind system
        const wind = {
            strength: 0,   // current wind strength (negative = left, positive = right)
            target: 0,     // target strength to ease toward
            changeTimer: 0 // seconds until next wind shift
        };

        const camera = {
            x: 0
        };

        const online = {
            active: false,
            roomCode: null,
            roomRef: null,
            roomUnsubscribe: null,
            localSeat: 0,
            localSlot: 1,
            localSide: 'left',
            hostUid: null,
            guestUid: null,
            participants: [],
            localUid: null,
            authPromise: null,
            applyingRemoteAction: false,
            lastProcessedActionId: null,
            suppressRoomWrites: false,
            readyToStart: false,
            hostReady: false,
            guestReady: false,
            readyByUid: {},
            combat: {
                active: false,
                turnOrder: [],
                currentTurnUid: null,
                seatUids: { 1: null, 2: null },
                playerStates: {}
            },
            settings: null,
            lastLiveSyncAt: 0,
            lastLiveSignature: '',
            lastAppliedLiveTs: 0,
            liveLatencyMs: null,
            liveJitterMs: 0,
            lastRemoteSeenAt: 0,
            lastConnectionUiUpdateAt: 0
        };

        let forcedSpawnPositions = null;

        function setOnlineStatus(message, isError = false) {
            const el = document.getElementById('onlineStatus');
            if (!el) return;
            el.textContent = message;
            el.style.color = isError ? '#ff9f9f' : '#4ecdc4';
        }

        function setModeHint(text) {
            const modeHint = document.getElementById('modeHint');
            if (modeHint) {
                modeHint.textContent = text;
            }
        }

        function normalizeTeamSide(side, fallback = 'left') {
            return side === 'right' ? 'right' : fallback;
        }

        function oppositeTeamSide(side) {
            return normalizeTeamSide(side) === 'left' ? 'right' : 'left';
        }

        const MAX_ROOM_PLAYERS = 6;
        const ROOM_SLOTS = [1, 2, 3, 4, 5, 6];
        const SLOT_LABELS = {
            1: "Player 01's name",
            2: "Player 02's name",
            3: "Player 03's name",
            4: "Player 04's name",
            5: "Player 05's name",
            6: "Player 06's name"
        };

        function sideFromSlot(slot) {
            return [1, 2, 3].includes(Number(slot)) ? 'left' : 'right';
        }

        function getSlotsForSide(side) {
            return normalizeTeamSide(side) === 'left' ? [1, 2, 3] : [4, 5, 6];
        }

        function getSlotLabel(slot) {
            return SLOT_LABELS[slot] || `Player ${String(slot).padStart(2, '0')}`;
        }

        function getShortDisplayName(name, maxChars = 12) {
            const text = String(name || '').trim();
            if (!text) return 'Player';
            if (text.length <= maxChars) {
                return text;
            }
            return `${text.slice(0, Math.max(1, maxChars - 3))}...`;
        }

        function getParticipantByUid(uid) {
            if (!uid) return null;
            return (online.participants || []).find((p) => p.uid === uid) || null;
        }

        function isOnlineMultiParticipantCombat() {
            return Boolean(online.active && online.combat && online.combat.active);
        }

        function getSpawnXForSlot(slot, settings = online.settings) {
            const cfg = settings || getSpawnSettings();
            const leftBase = Number.isFinite(cfg.p1x) ? cfg.p1x : 220;
            const rightBase = Number.isFinite(cfg.p2x) ? cfg.p2x : (WORLD_WIDTH - 220);

            const leftOffsets = { 1: 0, 2: 130, 3: -130 };
            const rightOffsets = { 4: 0, 5: -130, 6: 130 };
            const side = sideFromSlot(slot);
            const base = side === 'left' ? leftBase : rightBase;
            const offset = side === 'left' ? (leftOffsets[slot] || 0) : (rightOffsets[slot] || 0);
            return Math.max(80, Math.min(WORLD_WIDTH - 80, base + offset));
        }

        function buildParticipantState(participant) {
            const side = normalizeTeamSide(participant.side, sideFromSlot(participant.slot));
            const x = getSpawnXForSlot(participant.slot);
            const surface = getSurfaceBelowY(x, 0);
            return {
                uid: participant.uid,
                slot: participant.slot,
                side,
                name: participant.name || getSlotLabel(participant.slot),
                x,
                y: surface.y - 40,
                vx: 0,
                vy: 0,
                angle: side === 'left' ? 45 : 135,
                aimFacing: side === 'left' ? 1 : -1,
                power: 0,
                health: 100,
                maxHealth: 100,
                fuel: 300,
                maxFuel: 300,
                charging: false,
                groundAngle: surface.slope,
                shake: 0,
                shakeX: 0,
                shakeY: 0,
                alive: true,
                deadFadeUntilMs: 0
            };
        }

        function getSlotVisuals(slot) {
            const bySlot = {
                1: { color: '#4ecdc4', vehicleColor: '#667eea' },
                2: { color: '#ff6b6b', vehicleColor: '#764ba2' },
                3: { color: '#4cd97b', vehicleColor: '#2f9e44' },
                4: { color: '#ffd166', vehicleColor: '#f08c00' },
                5: { color: '#74c0fc', vehicleColor: '#1864ab' },
                6: { color: '#ff8787', vehicleColor: '#c2255c' }
            };
            return bySlot[Number(slot)] || bySlot[1];
        }

        function buildRenderPlayerFromCombatState(state) {
            const visuals = getSlotVisuals(state.slot);
            return {
                ...state,
                vehicleType: 'catrket',
                color: visuals.color,
                vehicleColor: visuals.vehicleColor,
                shake: Number.isFinite(state.shake) ? state.shake : 0,
                shakeX: Number.isFinite(state.shakeX) ? state.shakeX : 0,
                shakeY: Number.isFinite(state.shakeY) ? state.shakeY : 0
            };
        }

        function getDisplayCombatStates() {
            if (!isOnlineMultiParticipantCombat()) {
                return [];
            }
            return (online.combat.turnOrder || [])
                .map((uid) => online.combat.playerStates[uid])
                .filter((state) => Boolean(state && (state.alive || getDeathFadeAlpha(state) > 0)));
        }

        function getStateBySeat(seat) {
            const uid = online.combat.seatUids[seat];
            return uid ? online.combat.playerStates[uid] : null;
        }

        function resetOnlineCombatState() {
            online.combat.active = false;
            online.combat.turnOrder = [];
            online.combat.currentTurnUid = null;
            online.combat.seatUids = { 1: null, 2: null };
            online.combat.playerStates = {};
        }

        function ensureParticipantCombatState(uid) {
            if (!uid) return null;
            if (!online.combat.playerStates[uid]) {
                const participant = getParticipantByUid(uid);
                if (!participant) return null;
                online.combat.playerStates[uid] = buildParticipantState(participant);
            }
            return online.combat.playerStates[uid];
        }

        function applyStateToSeatPlayer(state, seat) {
            if (!state) return;
            const player = seat === 1 ? player1 : player2;
            player.x = state.x;
            player.y = state.y;
            player.vx = state.vx;
            player.vy = state.vy;
            player.angle = state.angle;
            player.aimFacing = state.aimFacing;
            player.power = state.power;
            player.health = state.health;
            player.maxHealth = state.maxHealth;
            player.fuel = state.fuel;
            player.maxFuel = state.maxFuel;
            player.charging = Boolean(state.charging);
            player.groundAngle = state.groundAngle;
            const visuals = getSlotVisuals(state.slot);
            player.color = visuals.color;
            player.vehicleColor = visuals.vehicleColor;
            player.shake = Number.isFinite(state.shake) ? state.shake : 0;
            player.shakeX = Number.isFinite(state.shakeX) ? state.shakeX : 0;
            player.shakeY = Number.isFinite(state.shakeY) ? state.shakeY : 0;
            player.deadFadeUntilMs = Number(state.deadFadeUntilMs) || 0;
        }

        function getSeatForParticipantUid(uid) {
            if (online.combat.seatUids[1] === uid) return 1;
            if (online.combat.seatUids[2] === uid) return 2;
            return 0;
        }

        function applySeatPlayerStateFromCombatState(state) {
            const seat = getSeatForParticipantUid(state.uid);
            if (!seat) {
                return;
            }
            applyStateToSeatPlayer(state, seat);
        }

        function markParticipantDead(state, shouldAdvanceTurn = true) {
            if (!state || !state.alive) {
                return;
            }

            state.alive = false;
            state.health = 0;
            triggerDeathFade(state);
            applySeatPlayerStateFromCombatState(state);

            const side = normalizeTeamSide(state.side);
            if (getAliveCountBySide(side) === 0) {
                const winnerSide = oppositeTeamSide(side);
                endGame(winnerSide === 'left' ? 1 : 2);
                return;
            }

            if (!shouldAdvanceTurn) {
                return;
            }

            if (!online.active || !isOnlineMultiParticipantCombat() || online.combat.currentTurnUid === state.uid) {
                if (isOnlineMultiParticipantCombat() && online.combat.currentTurnUid !== state.uid) {
                    const currentState = online.combat.playerStates[online.combat.currentTurnUid];
                    if (currentState && currentState.alive) {
                        return;
                    }
                }
                switchTurn();
            }
        }

        function updateParticipantGravity(state, dt = 1) {
            if (!state || !state.alive) {
                return;
            }

            state.x += state.vx * dt;
            state.vx *= Math.pow(0.92, dt);

            if (Math.abs(state.vx) < 0.1) {
                state.vx = 0;
            }

            state.x = Math.max(50, Math.min(WORLD_WIDTH - 50, state.x));

            const surface = getSurfaceBelowY(state.x, state.y + 40 - SURFACE_SNAP_GRACE);
            const terrainY = surface.y;
            const playerBottom = state.y + 40;

            if (playerBottom >= WATER_LEVEL + 30) {
                markParticipantDead(state, true);
                return;
            }

            if (terrainY < WATER_LEVEL) {
                if (playerBottom < terrainY) {
                    state.vy += 0.6 * dt;
                    state.y += state.vy * dt;

                    if (state.y + 40 >= terrainY) {
                        state.y = terrainY - 40;
                        state.vy = 0;
                        const blended = lerp(state.groundAngle, surface.slope, 0.25);
                        state.groundAngle = clampAngleDelta(state.groundAngle, blended, 3);
                    }
                } else {
                    state.y = terrainY - 40;
                    state.vy = 0;
                    const blended = lerp(state.groundAngle, surface.slope, 0.25);
                    state.groundAngle = clampAngleDelta(state.groundAngle, blended, 3);
                }
            } else {
                state.vy += 0.6 * dt;
                state.y += state.vy * dt;
            }

            applySeatPlayerStateFromCombatState(state);
        }

        function persistSeatToState(seat) {
            const uid = online.combat.seatUids[seat];
            if (!uid) return;
            const state = ensureParticipantCombatState(uid);
            if (!state) return;
            const player = seat === 1 ? player1 : player2;
            state.x = player.x;
            state.y = player.y;
            state.vx = player.vx;
            state.vy = player.vy;
            state.angle = player.angle;
            state.aimFacing = player.aimFacing;
            state.power = player.power;
            state.charging = Boolean(player.charging);
            state.health = player.health;
            state.maxHealth = player.maxHealth;
            state.fuel = player.fuel;
            state.maxFuel = player.maxFuel;
            state.groundAngle = player.groundAngle;
            state.alive = player.health > 0;
            state.deadFadeUntilMs = Number(player.deadFadeUntilMs) || 0;
        }

        function getAliveCountBySide(side) {
            const targetSide = normalizeTeamSide(side);
            return Object.values(online.combat.playerStates).filter((state) => state.alive && normalizeTeamSide(state.side) === targetSide).length;
        }

        function getFirstAliveUidForSide(side) {
            const candidates = (online.combat.turnOrder || []).filter((uid) => {
                const state = online.combat.playerStates[uid];
                return Boolean(state && state.alive && normalizeTeamSide(state.side) === normalizeTeamSide(side));
            });
            return candidates.length ? candidates[0] : null;
        }

        function setOnlineCombatSeatPair(attackerUid) {
            const attackerState = ensureParticipantCombatState(attackerUid);
            if (!attackerState || !attackerState.alive) {
                return false;
            }

            const attackerSide = normalizeTeamSide(attackerState.side);
            const defenderSide = oppositeTeamSide(attackerSide);
            const defenderUid = getFirstAliveUidForSide(defenderSide);
            if (!defenderUid) {
                endGame(attackerSide === 'left' ? 1 : 2);
                return false;
            }

            const defenderState = ensureParticipantCombatState(defenderUid);
            const attackerSeat = attackerSide === 'left' ? 1 : 2;
            const defenderSeat = attackerSeat === 1 ? 2 : 1;

            online.combat.seatUids[attackerSeat] = attackerUid;
            online.combat.seatUids[defenderSeat] = defenderUid;
            online.combat.currentTurnUid = attackerUid;

            applyStateToSeatPlayer(attackerState, attackerSeat);
            applyStateToSeatPlayer(defenderState, defenderSeat);

            game.currentPlayer = attackerSeat;
            return true;
        }

        function initOnlineCombatRoster() {
            if (!online.active) {
                resetOnlineCombatState();
                return;
            }

            const roster = [...(online.participants || [])]
                .sort((a, b) => Number(a.slot) - Number(b.slot));

            if (roster.length < 2) {
                resetOnlineCombatState();
                return;
            }

            resetOnlineCombatState();
            online.combat.active = true;
            online.combat.turnOrder = roster.map((p) => p.uid);

            roster.forEach((participant) => {
                online.combat.playerStates[participant.uid] = buildParticipantState(participant);
            });

            const firstUid = online.combat.turnOrder[0] || null;
            if (firstUid) {
                setOnlineCombatSeatPair(firstUid);
            }
        }

        function getCurrentTurnPlayerName() {
            if (isOnlineMultiParticipantCombat()) {
                const uid = online.combat.currentTurnUid;
                const state = uid ? online.combat.playerStates[uid] : null;
                if (state && state.name) {
                    return state.name;
                }
            }
            return `Player ${game.currentPlayer}`;
        }

        function isLocalTurnOwner() {
            if (!online.active) {
                return game.currentPlayer === 1;
            }
            if (isOnlineMultiParticipantCombat()) {
                return online.combat.currentTurnUid === online.localUid;
            }
            return game.currentPlayer === getLocalPlayerSlot();
        }

        function isBotUid(uid) {
            return typeof uid === 'string' && uid.startsWith('bot_');
        }

        function getBotTurnActors() {
            if (online.active && isOnlineMultiParticipantCombat()) {
                const turnUid = online.combat.currentTurnUid;
                if (!isBotUid(turnUid)) {
                    return null;
                }
                const actor = game.currentPlayer === 1 ? player1 : player2;
                const target = game.currentPlayer === 1 ? player2 : player1;
                return { actor, target };
            }

            if (!online.active && game.currentPlayer === 2) {
                return { actor: player2, target: player1 };
            }

            return null;
        }

        function beginBotTurnIfNeeded() {
            const actors = getBotTurnActors();
            if (!actors || game.waitingForTurn || game.endSlowMo || projectile) {
                game.botThinking = false;
                return;
            }

            if (!game.botThinking) {
                game.botThinking = true;
                game.botMoveTimer = 0;
                botCalculateMove(actors);
            }
        }

        function getLocalParticipantRecord() {
            return online.participants.find((p) => p && p.uid === online.localUid) || null;
        }

        function normalizeRoomParticipants(room) {
            const bySlot = new Map();
            const participantsMap = room && room.participants && typeof room.participants === 'object'
                ? room.participants
                : {};

            Object.keys(participantsMap).forEach((uid) => {
                const entry = participantsMap[uid] || {};
                const slot = Number(entry.slot);
                if (!ROOM_SLOTS.includes(slot) || bySlot.has(slot)) {
                    return;
                }
                const side = normalizeTeamSide(entry.side, sideFromSlot(slot));
                const name = String(entry.name || '').trim() || getSlotLabel(slot);
                const email = String(entry.email || '').trim();
                const avatarUrl = String(entry.avatarUrl || entry.photoURL || '').trim();
                bySlot.set(slot, {
                    uid,
                    slot,
                    side,
                    name,
                    email,
                    avatarUrl
                });
            });

            if (room && room.hostUid && ![...bySlot.values()].some((p) => p.uid === room.hostUid)) {
                const slot = 1;
                if (!bySlot.has(slot)) {
                    bySlot.set(slot, {
                        uid: room.hostUid,
                        slot,
                        side: 'left',
                        name: getSlotLabel(slot),
                        email: '',
                        avatarUrl: ''
                    });
                }
            }

            if (room && room.guestUid && ![...bySlot.values()].some((p) => p.uid === room.guestUid)) {
                const slot = 2;
                if (!bySlot.has(slot)) {
                    bySlot.set(slot, {
                        uid: room.guestUid,
                        slot,
                        side: 'right',
                        name: getSlotLabel(slot),
                        email: '',
                        avatarUrl: ''
                    });
                }
            }

            return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
        }

        function getLocalPlayerSlot() {
            if (online.localSeat === 0) {
                return 0;
            }
            return normalizeTeamSide(online.localSide) === 'left' ? 1 : 2;
        }

        function getRemotePlayerSlot() {
            const localPlayerSlot = getLocalPlayerSlot();
            if (localPlayerSlot === 1) return 2;
            if (localPlayerSlot === 2) return 1;
            return 0;
        }

        function updateSideMeta() {
            const sideMeta = document.getElementById('sideMeta');

            if (!sideMeta) {
                return;
            }

            if (!online.active || !online.roomCode) {
                sideMeta.textContent = 'Join a room to pick your side.';
                return;
            }

            const localSide = normalizeTeamSide(online.localSide);
            const localSlot = Number(online.localSlot) || 1;
            const localRole = online.localSeat === 1 ? 'Host' : (online.localSeat === 2 ? 'Guest' : 'Member');
            sideMeta.textContent = `You are ${localRole} on ${localSide.toUpperCase()} side (slot ${localSlot}).`;
        }

        function hasConnectedRoom() {
            return Boolean(online.active && online.roomRef && online.roomCode);
        }

        function updatePrepLockedUi() {
            const layout = document.querySelector('#startScreen .matchPrepLayout');
            if (!layout) return;

            const connected = hasConnectedRoom();
            layout.classList.toggle('room-locked', !connected);

            const actionIds = [
                'carSelectButton',
                'itemSelectButton',
                'switchSideButton',
                'addBotButton',
                'removeBotButton',
                'readyToggleButton',
                'startShootButton'
            ];

            actionIds.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.disabled = !connected;
            });
        }

        function showMainTitleFrame() {
            const main = document.getElementById('mainTitleFrame');
            const prep = document.getElementById('matchPrepFrame');
            if (main) main.classList.add('active');
            if (prep) prep.classList.remove('active');
        }

        const prepBackButtonEl = document.querySelector('.prepBackButton');
        if (prepBackButtonEl) {
            prepBackButtonEl.addEventListener('click', (event) => {
                event.preventDefault();
                showMainTitleFrame();
            });
        }

        function showMatchPrepFrame() {
            const main = document.getElementById('mainTitleFrame');
            const prep = document.getElementById('matchPrepFrame');
            if (main) main.classList.remove('active');
            if (prep) prep.classList.add('active');
        }

        function openMatchPrep(mode = 'bot') {
            showMatchPrepFrame();
            updateReadyToggleButton();
            updatePrepLockedUi();
            if (mode === 'online') {
                setModeHint('[ONLINE] Online mode selected. Create or join a room, ready up, then start.');
                if (!online.active) {
                    setOnlineStatus('Online match prep: create or join a room.');
                }
                return;
            }
            setModeHint('[BOT] Bot mode selected. You can still switch to online room mode anytime.');
            if (!online.active) {
                setOnlineStatus('Bot match prep ready. Press START GAME when ready.');
            }
        }

        function setPickSelectPopupOpen(open) {
            const popup = document.getElementById('pickSelectPopup');
            if (!popup) return;
            popup.classList.toggle('active', open);
            popup.setAttribute('aria-hidden', open ? 'false' : 'true');
        }

        function openPickSelectPopup(type) {
            const titleEl = document.getElementById('pickSelectPopupTitle');
            const messageEl = document.getElementById('pickSelectPopupMessage');
            const normalizedType = type === 'item' ? 'Item' : 'Car';
            if (titleEl) {
                titleEl.textContent = `${normalizedType} Select`;
            }
            if (messageEl) {
                messageEl.textContent = `${normalizedType} Select page is not created yet. We will build it later.`;
            }
            setPickSelectPopupOpen(true);
        }

        function openCarSelectPage() {
            openPickSelectPopup('car');
        }

        function openItemSelectPage() {
            openPickSelectPopup('item');
        }

        const carSelectButton = document.getElementById('carSelectButton');
        if (carSelectButton) {
            carSelectButton.addEventListener('click', () => {
                openCarSelectPage();
            });
        }

        const itemSelectButton = document.getElementById('itemSelectButton');
        if (itemSelectButton) {
            itemSelectButton.addEventListener('click', () => {
                openItemSelectPage();
            });
        }

        const pickSelectPopup = document.getElementById('pickSelectPopup');
        const pickSelectPopupClose = document.getElementById('pickSelectPopupClose');
        const pickSelectPopupOk = document.getElementById('pickSelectPopupOk');

        if (pickSelectPopupClose) {
            pickSelectPopupClose.addEventListener('click', () => {
                setPickSelectPopupOpen(false);
            });
        }

        if (pickSelectPopupOk) {
            pickSelectPopupOk.addEventListener('click', () => {
                setPickSelectPopupOpen(false);
            });
        }

        if (pickSelectPopup) {
            pickSelectPopup.addEventListener('click', (event) => {
                if (event.target === pickSelectPopup) {
                    setPickSelectPopupOpen(false);
                }
            });
        }

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && pickSelectPopup && pickSelectPopup.classList.contains('active')) {
                setPickSelectPopupOpen(false);
            }
        });

        async function startSinglePlayerBotMatch() {
            if (online.active) {
                await leaveOnlineRoom(false);
            }
            setModeHint('[BOT] Player 2 is controlled by AI');
            await startGame(false);
        }

        function formatAuthState(user) {
            if (!user) {
                return 'Auth: signed out';
            }
            if (user.email) {
                return `Auth: ${user.email}`;
            }
            return 'Auth: signed in';
        }

        function updateMainTitleAuthButton(user = (typeof auth !== 'undefined' && auth ? auth.currentUser : null)) {
            const button = document.getElementById('mainTitleAuthButton');
            if (!button) return;
            const signedIn = Boolean(user);
            button.classList.toggle('signed-in', signedIn);
            button.textContent = signedIn ? 'Sign Out' : 'Sign In';
            button.setAttribute('aria-label', signedIn ? 'Sign Out' : 'Sign In');
            button.title = signedIn ? 'Sign Out' : 'Sign In';
        }

        function updateOnlineAuthState(user = (typeof auth !== 'undefined' && auth ? auth.currentUser : null)) {
            const authStateIds = ['onlineAuthState', 'onlineAuthStateMain'];
            const text = formatAuthState(user);
            const color = user ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 180, 180, 0.95)';

            authStateIds.forEach((id) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = text;
                el.style.color = color;
                el.title = text;
            });

            updateMainTitleAuthButton(user);
        }

        async function toggleOnlineAuth() {
            if (typeof auth === 'undefined' || !auth) {
                setOnlineStatus('Auth service is unavailable. Reload and try again.', true);
                return;
            }

            if (auth.currentUser) {
                await logoutOnline();
                return;
            }

            await loginOnline();
        }

        function getLocalDisplayName() {
            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (!user) {
                return null;
            }
            if (user.displayName && String(user.displayName).trim()) {
                return String(user.displayName).trim();
            }
            if (user.email && String(user.email).trim()) {
                return String(user.email).split('@')[0];
            }
            return null;
        }

        function getLocalEmailName() {
            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (user && user.email && String(user.email).trim()) {
                return String(user.email).split('@')[0];
            }
            const displayName = getLocalDisplayName();
            return displayName || null;
        }

        function getLocalAvatarUrl() {
            const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
            if (user && user.photoURL && String(user.photoURL).trim()) {
                return String(user.photoURL).trim();
            }
            return '';
        }

        async function syncLocalParticipantName() {
            if (!online.active || !online.roomRef || !online.localUid) {
                return;
            }
            const displayName = getLocalEmailName();
            if (!displayName) {
                return;
            }
            try {
                await online.roomRef.update({
                    [`participants.${online.localUid}.name`]: displayName,
                    [`participants.${online.localUid}.email`]: ((typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) ? String(auth.currentUser.email).trim() : ''),
                    [`participants.${online.localUid}.avatarUrl`]: getLocalAvatarUrl(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                // Ignore transient profile sync failures.
            }
        }

        function updatePrepPlayerNames() {
            const slotRows = {};
            ROOM_SLOTS.forEach((slot) => {
                const row = document.querySelector(`.teamSlot[data-slot="${slot}"]`);
                if (!row) return;
                const nameEl = row.querySelector('.teamName');
                const markEl = row.querySelector('.teamMark');
                const avatarEl = row.querySelector('.teamAvatar');
                slotRows[slot] = { row, nameEl, markEl, avatarEl };

                if (nameEl) {
                    nameEl.textContent = getSlotLabel(slot);
                }
                if (markEl) {
                    markEl.classList.remove('ready');
                    markEl.textContent = '';
                }
                if (avatarEl) {
                    avatarEl.removeAttribute('src');
                    avatarEl.style.display = 'none';
                }
            });

            const applyParticipantToSlot = (participant) => {
                const slot = Number(participant.slot);
                const ui = slotRows[slot];
                if (!ui) return;

                const emailName = String(participant.email || '').trim();
                const fallbackName = String(participant.name || '').trim();
                const legacyName = fallbackName.includes('@') ? fallbackName.split('@')[0] : fallbackName;
                const displayName = (emailName.includes('@') ? emailName.split('@')[0] : emailName) || legacyName || getSlotLabel(slot);

                if (ui.nameEl) {
                    ui.nameEl.textContent = displayName;
                }

                const avatarUrl = String(participant.avatarUrl || '').trim();
                if (ui.avatarEl && avatarUrl) {
                    ui.avatarEl.src = avatarUrl;
                    ui.avatarEl.style.display = 'block';
                }

                if (ui.markEl) {
                    const isReady = Boolean(online.readyByUid && participant.uid && online.readyByUid[participant.uid] === true);
                    ui.markEl.classList.toggle('ready', isReady);
                    ui.markEl.textContent = isReady ? '✓' : '';
                }
            };

            if (online.participants && online.participants.length > 0) {
                online.participants.forEach((participant) => applyParticipantToSlot(participant));
                return;
            }

            const displayName = getLocalEmailName();
            const avatarUrl = getLocalAvatarUrl();
            if (!displayName) return;

            const fallbackSlot = online.active && Number.isFinite(online.localSlot)
                ? online.localSlot
                : (normalizeTeamSide(online.localSide) === 'left' ? 1 : 2);
            const ui = slotRows[fallbackSlot];
            if (!ui) return;
            if (ui.nameEl) {
                ui.nameEl.textContent = displayName;
            }
            if (ui.avatarEl && avatarUrl) {
                ui.avatarEl.src = avatarUrl;
                ui.avatarEl.style.display = 'block';
            }
            if (ui.markEl) {
                const isReady = Boolean(online.readyByUid && online.localUid && online.readyByUid[online.localUid] === true);
                ui.markEl.classList.toggle('ready', isReady);
                ui.markEl.textContent = isReady ? '✓' : '';
            }
        }

        function getFriendlyOnlineAuthError(error) {
            if (!error || !error.code) return 'Sign in failed.';
            if (error.code === 'auth/unauthorized-domain') {
                return 'Google sign-in is blocked for this domain. Add the host to Firebase Authorized domains.';
            }
            if (error.code === 'auth/popup-blocked') {
                return 'Popup was blocked. Allow popups or try again.';
            }
            if (error.code === 'auth/popup-closed-by-user') {
                return 'Google sign-in popup was closed before completion.';
            }
            if (error.code === 'auth/operation-not-supported-in-this-environment') {
                return 'Google popup sign-in is not supported in this environment. Use a hosted URL.';
            }
            return error.message || 'Sign in failed.';
        }

        async function loginOnline() {
            if (typeof auth === 'undefined' || !auth) {
                setOnlineStatus('Auth service is unavailable. Reload and try again.', true);
                return;
            }
            if (typeof firebase === 'undefined' || !firebase.auth || !firebase.auth.GoogleAuthProvider) {
                setOnlineStatus('Google auth is unavailable. Reload and try again.', true);
                return;
            }

            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });

            try {
                await auth.signInWithPopup(provider);
                online.localUid = auth.currentUser ? auth.currentUser.uid : online.localUid;
                updateOnlineAuthState(auth.currentUser);
                setOnlineStatus('Signed in. You can now create or join a room.');
            } catch (error) {
                if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment')) {
                    try {
                        await auth.signInWithRedirect(provider);
                        setOnlineStatus('Continuing with Google sign-in redirect...');
                        return;
                    } catch (redirectError) {
                        setOnlineStatus(getFriendlyOnlineAuthError(redirectError), true);
                        return;
                    }
                }
                setOnlineStatus(getFriendlyOnlineAuthError(error), true);
            }
        }

        async function logoutOnline() {
            if (typeof auth === 'undefined' || !auth) {
                setOnlineStatus('Auth service is unavailable. Reload and try again.', true);
                return;
            }
            try {
                await auth.signOut();
                online.localUid = null;
                updateOnlineAuthState(null);
                setOnlineStatus('Signed out from online mode.');
            } catch (error) {
                setOnlineStatus('Could not sign out.', true);
            }
        }

        function updateRoomMeta() {
            const roomMeta = document.getElementById('roomMeta');
            const readyMeta = document.getElementById('readyMeta');
            if (!roomMeta) return;
            if (!online.active || !online.roomCode) {
                roomMeta.textContent = 'No room connected.';
                if (readyMeta) {
                    readyMeta.textContent = 'Ready: 0/0';
                }
                setModeHint('[BOT] Player 2 is controlled by AI');
                updateReadyToggleButton();
                updateSideMeta();
                updatePrepPlayerNames();
                updateConnectionIndicator(true);
                updatePrepLockedUi();
                return;
            }
            const roleText = online.localSeat === 1 ? 'Host' : (online.localSeat === 2 ? 'Guest' : 'Member');
            const localSide = normalizeTeamSide(online.localSide);
            const localSlot = Number(online.localSlot) || 1;
            const peopleCount = Array.isArray(online.participants) ? online.participants.length : 0;
            roomMeta.textContent = `Room ${online.roomCode} | ${roleText} | ${localSide.toUpperCase()} (slot ${localSlot}) | Players ${peopleCount}/${MAX_ROOM_PLAYERS}`;
            if (readyMeta) {
                const readyCount = (online.participants || []).filter((p) => online.readyByUid[p.uid] === true).length;
                readyMeta.textContent = `Ready: ${readyCount}/${peopleCount}`;
            }
            setModeHint('[ONLINE] Left side fights Right side. Switch side anytime before the match starts.');
            updateReadyToggleButton();
            updateSideMeta();
            updatePrepPlayerNames();
            updateConnectionIndicator(true);
            updatePrepLockedUi();
        }

        function classifyConnection(latencyMs, jitterMs, stale) {
            if (stale) {
                return { label: 'Stale', color: '#ff9f9f' };
            }
            if (!Number.isFinite(latencyMs)) {
                return { label: 'Syncing', color: 'rgba(255, 255, 255, 0.72)' };
            }
            if (latencyMs <= 120 && jitterMs <= 35) {
                return { label: 'Good', color: '#7ef2b7' };
            }
            if (latencyMs <= 240 && jitterMs <= 80) {
                return { label: 'Fair', color: '#ffd37e' };
            }
            return { label: 'Poor', color: '#ffb17e' };
        }

        function updateConnectionIndicator(force = false) {
            const el = document.getElementById('connectionMeta');
            if (!el) return;

            const now = Date.now();
            if (!force && now - online.lastConnectionUiUpdateAt < 220) {
                return;
            }
            online.lastConnectionUiUpdateAt = now;

            if (!online.active || !online.roomCode) {
                el.textContent = 'Connection: Offline';
                el.style.color = 'rgba(255, 255, 255, 0.72)';
                return;
            }

            if (!game.isRunning) {
                el.textContent = 'Connection: Waiting for match';
                el.style.color = 'rgba(255, 255, 255, 0.72)';
                return;
            }

            const stale = online.lastRemoteSeenAt > 0 && (now - online.lastRemoteSeenAt > 2200);
            const latency = Number.isFinite(online.liveLatencyMs) ? Math.max(0, Math.round(online.liveLatencyMs)) : null;
            const jitter = Math.max(0, Math.round(online.liveJitterMs || 0));
            const quality = classifyConnection(latency, jitter, stale);

            const latencyText = latency === null ? '--' : `${latency}ms`;
            el.textContent = `Connection: ${quality.label} | ping ${latencyText} | jitter ${jitter}ms`;
            el.style.color = quality.color;
        }

        function updateReadyToggleButton() {
            const button = document.getElementById('readyToggleButton');
            if (!button) return;
            if (!online.active || !online.roomRef || !online.localUid) {
                button.textContent = 'Ready';
                return;
            }
            const localReady = online.readyByUid[online.localUid] === true;
            button.textContent = localReady ? 'Unready' : 'Ready';
        }

        function normalizeRoomCode(raw) {
            return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        }

        function generateRoomCode() {
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += alphabet[Math.floor(Math.random() * alphabet.length)];
            }
            return code;
        }

        // Spawn rule baseline for current and future maps.
        const SPAWN_RULES = {
            edgeMargin: 90,
            minDistance: 430,
            sampleStep: 4,
            maxSlopeDeg: 38,
            minSurfaceYGapFromWater: 30
        };

        function getSlopeAtFromSeries(series, x, window = 6) {
            const leftX = Math.max(0, x - window);
            const rightX = Math.min(WORLD_WIDTH, x + window);
            const leftY = series[leftX];
            const rightY = series[rightX];
            if (!Number.isFinite(leftY) || !Number.isFinite(rightY) || rightX === leftX) {
                return 0;
            }
            const dy = rightY - leftY;
            return Math.abs(-Math.atan2(dy, rightX - leftX) * 180 / Math.PI);
        }

        function collectSpawnCandidatesFromSurface(surfaceSeries) {
            if (!surfaceSeries || !surfaceSeries.length) {
                return [];
            }

            const candidates = [];
            let spanStart = null;

            const isSolid = (x) => {
                const y = surfaceSeries[x];
                return Number.isFinite(y) && y <= WATER_LEVEL - SPAWN_RULES.minSurfaceYGapFromWater;
            };

            const flushSpan = (endX) => {
                if (spanStart === null) {
                    return;
                }

                const innerStart = spanStart + SPAWN_RULES.edgeMargin;
                const innerEnd = endX - SPAWN_RULES.edgeMargin;
                if (innerEnd <= innerStart) {
                    spanStart = null;
                    return;
                }

                for (let x = innerStart; x <= innerEnd; x += SPAWN_RULES.sampleStep) {
                    if (!isSolid(x)) {
                        continue;
                    }
                    const slope = getSlopeAtFromSeries(surfaceSeries, x);
                    if (slope > SPAWN_RULES.maxSlopeDeg) {
                        continue;
                    }
                    candidates.push(x);
                }

                spanStart = null;
            };

            for (let x = 0; x <= WORLD_WIDTH; x++) {
                const solid = isSolid(x);
                if (solid && spanStart === null) {
                    spanStart = x;
                }
                if (!solid && spanStart !== null) {
                    flushSpan(x - 1);
                }
            }
            if (spanStart !== null) {
                flushSpan(WORLD_WIDTH);
            }

            return candidates;
        }

        function collectSpawnCandidates() {
            const all = [];

            if (terrain.length > 0) {
                const groundSurface = new Array(WORLD_WIDTH + 1).fill(null);
                for (let x = 0; x <= WORLD_WIDTH; x++) {
                    if (terrain[x] && Number.isFinite(terrain[x].y)) {
                        groundSurface[x] = terrain[x].y;
                    }
                }
                all.push(...collectSpawnCandidatesFromSurface(groundSurface));
            }

            platformBodies.forEach((platform) => {
                if (platform && platform.surfaceTop) {
                    all.push(...collectSpawnCandidatesFromSurface(platform.surfaceTop));
                }
            });

            return all;
        }

        function pickSpawnPair() {
            const candidates = collectSpawnCandidates();

            if (candidates.length < 2) {
                const fallbackA = randRange(120, WORLD_WIDTH * 0.45);
                const fallbackB = randRange(WORLD_WIDTH * 0.55, WORLD_WIDTH - 120);
                return {
                    p1x: Math.min(fallbackA, fallbackB),
                    p2x: Math.max(fallbackA, fallbackB)
                };
            }

            let a = candidates[Math.floor(Math.random() * candidates.length)];
            let b = candidates[Math.floor(Math.random() * candidates.length)];

            for (let attempt = 0; attempt < 120; attempt++) {
                a = candidates[Math.floor(Math.random() * candidates.length)];
                b = candidates[Math.floor(Math.random() * candidates.length)];
                if (Math.abs(a - b) >= SPAWN_RULES.minDistance) {
                    break;
                }
            }

            if (Math.abs(a - b) < SPAWN_RULES.minDistance) {
                const fromA = [...candidates].sort((x1, x2) => Math.abs(x2 - a) - Math.abs(x1 - a));
                if (fromA.length) {
                    b = fromA[0];
                }
            }

            return {
                p1x: Math.min(a, b),
                p2x: Math.max(a, b)
            };
        }

        function getSpawnSettings() {
            const spawnPair = pickSpawnPair();

            return {
                p1x: spawnPair.p1x,
                p2x: spawnPair.p2x,
                initialWind: 0
            };
        }

        function getLocalUid() {
            try {
                if (typeof auth !== 'undefined' && auth && auth.currentUser) {
                    return auth.currentUser.uid;
                }
            } catch (error) {
                // Ignore auth read errors and fallback below.
            }

            const fallbackKey = 'gunrider_local_uid';
            let localUid = localStorage.getItem(fallbackKey);
            if (!localUid) {
                localUid = `anon_${Math.random().toString(36).slice(2, 12)}`;
                localStorage.setItem(fallbackKey, localUid);
            }
            return localUid;
        }

        function waitForAuthUser(timeoutMs = 8000) {
            if (typeof auth === 'undefined' || !auth) {
                return Promise.resolve(null);
            }
            if (auth.currentUser) {
                return Promise.resolve(auth.currentUser);
            }
            if (online.authPromise) {
                return online.authPromise;
            }

            online.authPromise = new Promise((resolve) => {
                let settled = false;
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try {
                        if (typeof unsubscribe === 'function') {
                            unsubscribe();
                        }
                    } catch (error) {
                        // No-op.
                    }
                    resolve(auth.currentUser || null);
                }, timeoutMs);

                const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    unsubscribe();
                    resolve(user || null);
                }, () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    resolve(auth.currentUser || null);
                });
            }).finally(() => {
                online.authPromise = null;
            });

            return online.authPromise;
        }

        async function ensureMultiplayerReady() {
            if (typeof firebase === 'undefined' || typeof db === 'undefined' || !db) {
                setOnlineStatus('Firebase is not available. Online mode is disabled.', true);
                return false;
            }

            if (typeof auth === 'undefined' || !auth) {
                setOnlineStatus('Auth service is unavailable. Reload the page and try again.', true);
                return false;
            }

            const user = await waitForAuthUser();
            if (!user) {
                setOnlineStatus('Please sign in with Google before creating or joining a room.', true);
                return false;
            }

            online.localUid = user.uid;
            return true;
        }

        function subscribeToRoom(code) {
            if (!online.roomRef) return;
            if (online.roomUnsubscribe) {
                online.roomUnsubscribe();
                online.roomUnsubscribe = null;
            }

            online.roomUnsubscribe = online.roomRef.onSnapshot((docSnap) => {
                if (!docSnap.exists) {
                    setOnlineStatus('Room no longer exists.', true);
                    leaveOnlineRoom(false);
                    return;
                }

                const room = docSnap.data();
                const isHost = room.hostUid === online.localUid;
                const isGuest = room.guestUid === online.localUid;
                online.localSeat = isHost ? 1 : (isGuest ? 2 : 0);
                online.hostUid = room.hostUid || null;
                online.guestUid = room.guestUid || null;
                online.participants = normalizeRoomParticipants(room);
                const localParticipant = getLocalParticipantRecord();
                online.localSlot = localParticipant ? localParticipant.slot : (online.localSeat === 2 ? 2 : 1);
                online.localSide = normalizeTeamSide(localParticipant ? localParticipant.side : sideFromSlot(online.localSlot));
                const readyByUid = room.readyByUid && typeof room.readyByUid === 'object' ? room.readyByUid : {};
                online.readyByUid = readyByUid;
                online.hostReady = Boolean(online.hostUid && readyByUid[online.hostUid] === true);
                online.guestReady = Boolean(online.guestUid && readyByUid[online.guestUid] === true);
                const participantCount = online.participants.length;
                const readyCount = online.participants.filter((p) => readyByUid[p.uid] === true).length;
                online.readyToStart = participantCount > 0 && readyCount === participantCount;
                online.settings = room.settings || null;
                updateRoomMeta();

                if (room.status === 'waiting') {
                    if (participantCount <= 1) {
                        setOnlineStatus(`Room ready. Share code ${code}.`);
                    } else if (!online.readyToStart) {
                        setOnlineStatus(`Waiting ready check: ${readyCount}/${participantCount} ready.`);
                    } else if (online.localSeat === 1) {
                        setOnlineStatus('Everyone is ready. Host can press START GAME.');
                    } else {
                        setOnlineStatus('Everyone is ready. Waiting for host to start.');
                    }
                }

                if (room.status === 'playing' && !game.isRunning && !game.prematchScan.active) {
                    if (online.settings) {
                        forcedSpawnPositions = {
                            p1x: online.settings.p1x,
                            p2x: online.settings.p2x
                        };
                    }
                    initTerrain();
                    startPrematchScan(true, Boolean(room.killingTimeStart));
                    setOnlineStatus('Online match started.');
                }

                const remoteLive = room.liveState
                    ? (getLocalPlayerSlot() === 1 ? room.liveState.p2 : (getLocalPlayerSlot() === 2 ? room.liveState.p1 : null))
                    : null;
                if (remoteLive && remoteLive.uid && remoteLive.uid !== online.localUid) {
                    applyRemoteLiveState(remoteLive);
                }

                if (room.lastAction && room.lastAction.id && room.lastAction.id !== online.lastProcessedActionId) {
                    const action = room.lastAction;
                    online.lastProcessedActionId = action.id;
                    if (action.actorUid !== online.localUid) {
                        applyRemoteAction(action);
                    }
                }
            }, (error) => {
                console.error('Room subscribe failed:', error);
                setOnlineStatus('Failed to subscribe to room updates.', true);
            });
        }

        async function createOnlineRoom() {
            if (!await ensureMultiplayerReady()) return;

            const code = generateRoomCode();
            const roomRef = db.collection('gunRiderRooms').doc(code);
            const settings = getSpawnSettings();

            try {
                const existing = await roomRef.get();
                if (existing.exists) {
                    setOnlineStatus('Collision on room code. Try again.');
                    return;
                }

                await roomRef.set({
                    code,
                    hostUid: online.localUid,
                    guestUid: null,
                    hostSide: 'left',
                    guestSide: 'right',
                    participants: {
                        [online.localUid]: {
                            uid: online.localUid,
                            name: getLocalEmailName() || getSlotLabel(1),
                            email: ((typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) ? String(auth.currentUser.email).trim() : ''),
                            avatarUrl: getLocalAvatarUrl(),
                            side: 'left',
                            slot: 1,
                            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }
                    },
                    readyByUid: {
                        [online.localUid]: false
                    },
                    hostReady: false,
                    guestReady: false,
                    status: 'waiting',
                    killingTimeStart: false,
                    liveState: {},
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    settings
                });

                online.active = true;
                online.roomCode = code;
                online.roomRef = roomRef;
                online.localSeat = 1;
                online.localSlot = 1;
                online.localSide = 'left';
                online.hostUid = online.localUid;
                online.guestUid = null;
                online.participants = [{
                    uid: online.localUid,
                    slot: 1,
                    side: 'left',
                    name: getLocalEmailName() || getSlotLabel(1),
                    email: ((typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) ? String(auth.currentUser.email).trim() : ''),
                    avatarUrl: getLocalAvatarUrl()
                }];
                online.readyByUid = {
                    [online.localUid]: false
                };
                online.hostReady = false;
                online.guestReady = false;
                online.settings = settings;
                updateRoomMeta();

                const input = document.getElementById('roomCodeInput');
                if (input) {
                    input.value = code;
                }

                subscribeToRoom(code);
                setOnlineStatus(`Room ${code} created. Share this code with your friend.`);
            } catch (error) {
                console.error('Create room failed:', error);
                if (error && error.code === 'permission-denied') {
                    setOnlineStatus('Room creation denied by Firestore rules. Publish the updated Gun Rider multiplayer rules first.', true);
                    return;
                }
                setOnlineStatus('Could not create room.', true);
            }
        }

        async function joinOnlineRoom() {
            if (!await ensureMultiplayerReady()) return;

            const input = document.getElementById('roomCodeInput');
            const code = normalizeRoomCode(input ? input.value : '');
            if (!code) {
                setOnlineStatus('Enter a valid room code.', true);
                return;
            }
            if (input) {
                input.value = code;
            }

            const roomRef = db.collection('gunRiderRooms').doc(code);

            try {
                const joinResult = await db.runTransaction(async (tx) => {
                    const roomDoc = await tx.get(roomRef);
                    if (!roomDoc.exists) {
                        throw new Error('room-not-found');
                    }

                    const room = roomDoc.data();
                    const participants = normalizeRoomParticipants(room);
                    const existingParticipant = participants.find((p) => p.uid === online.localUid) || null;

                    if (!existingParticipant && participants.length >= MAX_ROOM_PLAYERS) {
                        throw new Error('room-full');
                    }

                    if (existingParticipant) {
                        return {
                            room,
                            participant: existingParticipant,
                            playersCount: participants.length,
                            joinedExisting: true
                        };
                    }

                    const occupied = new Set(participants.map((p) => p.slot));
                    const freeSlot = ROOM_SLOTS.find((slot) => !occupied.has(slot));
                    if (!freeSlot) {
                        throw new Error('room-full');
                    }

                    const participant = {
                        uid: online.localUid,
                        name: getLocalEmailName() || getSlotLabel(freeSlot),
                        email: ((typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) ? String(auth.currentUser.email).trim() : ''),
                        avatarUrl: getLocalAvatarUrl(),
                        side: sideFromSlot(freeSlot),
                        slot: freeSlot,
                        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    const nextParticipants = {
                        ...(room.participants || {}),
                        [online.localUid]: participant
                    };

                    const updates = {
                        participants: nextParticipants,
                        readyByUid: {
                            ...(room.readyByUid || {}),
                            [online.localUid]: false
                        },
                        status: 'waiting',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    if (!room.guestUid && room.hostUid !== online.localUid) {
                        updates.guestUid = online.localUid;
                        updates.guestReady = false;
                        updates.guestSide = participant.side;
                    }
                    if (room.hostUid === online.localUid) {
                        updates.hostSide = participant.side;
                    }

                    tx.update(roomRef, updates);

                    return {
                        room: {
                            ...room,
                            participants: nextParticipants,
                            readyByUid: updates.readyByUid,
                            guestUid: updates.guestUid || room.guestUid
                        },
                        participant,
                        playersCount: participants.length + 1,
                        joinedExisting: false
                    };
                });

                online.active = true;
                online.roomCode = code;
                online.roomRef = roomRef;
                online.hostUid = joinResult.room.hostUid || null;
                online.guestUid = joinResult.room.guestUid || null;
                online.localSeat = joinResult.room.hostUid === online.localUid
                    ? 1
                    : (joinResult.room.guestUid === online.localUid ? 2 : 0);
                online.localSlot = joinResult.participant.slot;
                online.localSide = normalizeTeamSide(joinResult.participant.side, sideFromSlot(joinResult.participant.slot));
                online.participants = normalizeRoomParticipants(joinResult.room);
                online.readyByUid = (joinResult.room.readyByUid && typeof joinResult.room.readyByUid === 'object')
                    ? joinResult.room.readyByUid
                    : {};
                online.hostReady = Boolean(joinResult.room.hostReady);
                online.guestReady = Boolean(joinResult.room.guestReady);
                online.settings = joinResult.room.settings || null;
                updateRoomMeta();
                subscribeToRoom(code);

                setOnlineStatus(`Joined room ${code}. Players in room: ${joinResult.playersCount}/${MAX_ROOM_PLAYERS}.`);
            } catch (error) {
                console.error('Join room failed:', error);
                if (error && error.message === 'room-not-found') {
                    setOnlineStatus('Room not found.', true);
                    return;
                }
                if (error && error.message === 'room-full') {
                    setOnlineStatus(`Room is full (${MAX_ROOM_PLAYERS}/${MAX_ROOM_PLAYERS}).`, true);
                    return;
                }
                if (error && error.code === 'permission-denied') {
                    setOnlineStatus('Room join denied by Firestore rules. Current rules likely still allow only host + one guest.', true);
                    return;
                }
                setOnlineStatus('Could not join room.', true);
            }
        }

        async function leaveOnlineRoom(clearStatus = true) {
            try {
                if (online.roomRef && online.active && online.localUid) {
                    const updates = {
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        hostReady: false,
                        guestReady: false,
                        [`readyByUid.${online.localUid}`]: firebase.firestore.FieldValue.delete(),
                        [`participants.${online.localUid}`]: firebase.firestore.FieldValue.delete()
                    };
                    if (online.localSeat === 1) {
                        updates.hostUid = null;
                        updates.status = 'finished';
                    } else if (online.localSeat === 2) {
                        updates.guestUid = null;
                        updates.status = 'waiting';
                    } else {
                        updates.status = 'waiting';
                    }
                    await online.roomRef.update(updates);
                }
            } catch (error) {
                console.warn('Leave room update failed:', error);
            }

            if (online.roomUnsubscribe) {
                online.roomUnsubscribe();
                online.roomUnsubscribe = null;
            }

            online.active = false;
            online.roomCode = null;
            online.roomRef = null;
            online.localSeat = 0;
            online.localSlot = 1;
            online.localSide = 'left';
            online.hostUid = null;
            online.guestUid = null;
            online.participants = [];
            online.lastProcessedActionId = null;
            online.readyToStart = false;
            online.hostReady = false;
            online.guestReady = false;
            online.readyByUid = {};
            resetOnlineCombatState();
            online.settings = null;
            online.lastLiveSyncAt = 0;
            online.lastLiveSignature = '';
            online.lastAppliedLiveTs = 0;
            online.liveLatencyMs = null;
            online.liveJitterMs = 0;
            online.lastRemoteSeenAt = 0;
            online.lastConnectionUiUpdateAt = 0;
            forcedSpawnPositions = null;
            updateRoomMeta();

            if (clearStatus) {
                setOnlineStatus('Left room.');
            }
        }

        async function copyRoomCode() {
            if (!online.roomCode) {
                setOnlineStatus('Create or join a room first.', true);
                return;
            }
            try {
                await navigator.clipboard.writeText(online.roomCode);
                setOnlineStatus(`Copied room code: ${online.roomCode}`);
            } catch (error) {
                setOnlineStatus(`Room code: ${online.roomCode}`);
            }
        }

        async function toggleOnlineReady() {
            if (!online.active || !online.roomRef) {
                setOnlineStatus('Create or join a room first.', true);
                return;
            }

            if (!online.localUid) {
                setOnlineStatus('You are not joined in this room.', true);
                return;
            }
            const localInRoom = (online.participants || []).some((p) => p.uid === online.localUid);
            if (!localInRoom) {
                setOnlineStatus('You are not joined in this room.', true);
                return;
            }

            const current = online.readyByUid[online.localUid] === true;
            const nextReady = !current;

            try {
                await db.runTransaction(async (tx) => {
                    const roomDoc = await tx.get(online.roomRef);
                    if (!roomDoc.exists) {
                        throw new Error('room-not-found');
                    }

                    const room = roomDoc.data() || {};
                    const participants = normalizeRoomParticipants(room);
                    const participantUids = new Set(participants.map((p) => p.uid));
                    if (!participantUids.has(online.localUid)) {
                        throw new Error('not-in-room');
                    }

                    const readyByUid = {
                        ...(room.readyByUid || {}),
                        [online.localUid]: nextReady
                    };

                    const hostReady = Boolean(room.hostUid && readyByUid[room.hostUid] === true);
                    const guestReady = Boolean(room.guestUid && readyByUid[room.guestUid] === true);

                    tx.update(online.roomRef, {
                        readyByUid,
                        hostReady,
                        guestReady,
                        status: 'waiting',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                // Optimistic local update so button text responds instantly.
                online.readyByUid = {
                    ...(online.readyByUid || {}),
                    [online.localUid]: nextReady
                };
                updateReadyToggleButton();
                setOnlineStatus(nextReady ? 'You are ready.' : 'You are unready.');
            } catch (error) {
                console.error('Ready toggle failed:', error);
                if (error && error.message === 'room-not-found') {
                    setOnlineStatus('Room no longer exists.', true);
                    return;
                }
                if (error && error.message === 'not-in-room') {
                    setOnlineStatus('You are not joined in this room.', true);
                    return;
                }
                setOnlineStatus('Could not update ready status.', true);
            }
        }

        async function switchOnlineSide() {
            if (!online.active || !online.roomRef) {
                setOnlineStatus('Join a room first to switch side.', true);
                return;
            }

            try {
                const roomDoc = await online.roomRef.get();
                if (!roomDoc.exists) {
                    setOnlineStatus('Room no longer exists.', true);
                    return;
                }

                const room = roomDoc.data() || {};
                const participants = normalizeRoomParticipants(room);
                const localParticipant = participants.find((p) => p.uid === online.localUid);
                if (!localParticipant) {
                    setOnlineStatus('You are not registered in this room yet.', true);
                    return;
                }

                const nextSide = oppositeTeamSide(localParticipant.side);
                const occupied = new Set(participants.filter((p) => p.uid !== online.localUid).map((p) => p.slot));
                const targetSlot = getSlotsForSide(nextSide).find((slot) => !occupied.has(slot));

                if (!targetSlot) {
                    setOnlineStatus(`Cannot switch. ${nextSide.toUpperCase()} side is full.`, true);
                    return;
                }

                const resetReadyByUid = {};
                participants.forEach((participant) => {
                    resetReadyByUid[participant.uid] = false;
                });

                const updates = {
                    status: 'waiting',
                    hostReady: false,
                    guestReady: false,
                    readyByUid: resetReadyByUid,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    [`participants.${online.localUid}.slot`]: targetSlot,
                    [`participants.${online.localUid}.side`]: nextSide
                };

                if (room.hostUid === online.localUid) {
                    updates.hostSide = nextSide;
                }
                if (room.guestUid === online.localUid) {
                    updates.guestSide = nextSide;
                }

                await online.roomRef.update(updates);
                setOnlineStatus(`Side switched. You are now on ${nextSide.toUpperCase()} side (slot ${targetSlot}).`);
            } catch (error) {
                console.error('Side switch failed:', error);
                setOnlineStatus('Could not switch sides.', true);
            }
        }

        async function addFiveBotsForQuickTest() {
            if (!online.active || !online.roomRef || !online.roomCode) {
                setOnlineStatus('Create or join a room first.', true);
                return;
            }
            if (online.localSeat !== 1) {
                setOnlineStatus('Only host can add quick-test bots.', true);
                return;
            }

            try {
                const result = await db.runTransaction(async (tx) => {
                    const roomDoc = await tx.get(online.roomRef);
                    if (!roomDoc.exists) {
                        throw new Error('room-not-found');
                    }

                    const room = roomDoc.data() || {};
                    const participants = normalizeRoomParticipants(room);
                    const participantMap = { ...(room.participants || {}) };
                    const readyByUid = { ...(room.readyByUid || {}) };
                    const occupied = new Set(participants.map((p) => Number(p.slot)));

                    let addedCount = 0;
                    for (const slot of ROOM_SLOTS) {
                        if (addedCount >= 5) break;
                        if (occupied.has(slot)) continue;

                        const botUid = `bot_${online.roomCode}_${slot}`;
                        participantMap[botUid] = {
                            uid: botUid,
                            name: `BOT ${String(slot).padStart(2, '0')}`,
                            side: sideFromSlot(slot),
                            slot,
                            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        readyByUid[botUid] = true;
                        occupied.add(slot);
                        addedCount += 1;
                    }

                    const hostReady = Boolean(room.hostUid && readyByUid[room.hostUid] === true);
                    const guestReady = Boolean(room.guestUid && readyByUid[room.guestUid] === true);

                    tx.update(online.roomRef, {
                        participants: participantMap,
                        readyByUid,
                        hostReady,
                        guestReady,
                        status: 'waiting',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    return {
                        addedCount,
                        totalCount: Object.keys(participantMap).length
                    };
                });

                if (result.addedCount === 0) {
                    setOnlineStatus('No empty slots for bots. Room is already full.');
                } else {
                    setOnlineStatus(`Added ${result.addedCount} bot(s). Players now: ${result.totalCount}/${MAX_ROOM_PLAYERS}.`);
                }
            } catch (error) {
                if (error && error.message === 'room-not-found') {
                    setOnlineStatus('Room no longer exists.', true);
                    return;
                }
                console.error('Add bots failed:', error);
                setOnlineStatus('Could not add quick-test bots.', true);
            }
        }

        async function addOneBotForRoom() {
            if (!online.active || !online.roomRef || !online.roomCode) {
                setOnlineStatus('Create or join a room first.', true);
                return;
            }
            if (online.localSeat !== 1) {
                setOnlineStatus('Only host can add bots.', true);
                return;
            }

            try {
                const result = await db.runTransaction(async (tx) => {
                    const roomDoc = await tx.get(online.roomRef);
                    if (!roomDoc.exists) {
                        throw new Error('room-not-found');
                    }

                    const room = roomDoc.data() || {};
                    const participants = normalizeRoomParticipants(room);
                    const participantMap = { ...(room.participants || {}) };
                    const readyByUid = { ...(room.readyByUid || {}) };
                    const occupied = new Set(participants.map((p) => Number(p.slot)));

                    const leftOpenSlots = getSlotsForSide('left').filter((slot) => !occupied.has(slot));
                    const rightOpenSlots = getSlotsForSide('right').filter((slot) => !occupied.has(slot));
                    if (!leftOpenSlots.length && !rightOpenSlots.length) {
                        throw new Error('room-full');
                    }

                    const sideCounts = participants.reduce((acc, participant) => {
                        const side = sideFromSlot(participant.slot);
                        acc[side] += 1;
                        return acc;
                    }, { left: 0, right: 0 });

                    let nextSide = room.botAddNextSide === 'right' ? 'right' : 'left';
                    if (room.botAddNextSide !== 'left' && room.botAddNextSide !== 'right') {
                        nextSide = sideCounts.left <= sideCounts.right ? 'left' : 'right';
                    }

                    let chosenSide = nextSide;
                    if (chosenSide === 'left' && !leftOpenSlots.length) {
                        chosenSide = 'right';
                    } else if (chosenSide === 'right' && !rightOpenSlots.length) {
                        chosenSide = 'left';
                    }

                    const targetSlot = chosenSide === 'left' ? leftOpenSlots[0] : rightOpenSlots[0];

                    const botUid = `bot_${online.roomCode}_${targetSlot}`;
                    participantMap[botUid] = {
                        uid: botUid,
                        name: `BOT ${String(targetSlot).padStart(2, '0')}`,
                        side: chosenSide,
                        slot: targetSlot,
                        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    readyByUid[botUid] = true;

                    const hostReady = Boolean(room.hostUid && readyByUid[room.hostUid] === true);
                    const guestReady = Boolean(room.guestUid && readyByUid[room.guestUid] === true);

                    tx.update(online.roomRef, {
                        participants: participantMap,
                        readyByUid,
                        hostReady,
                        guestReady,
                        botAddNextSide: oppositeTeamSide(chosenSide),
                        status: 'waiting',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    return {
                        side: chosenSide,
                        slot: targetSlot,
                        totalCount: Object.keys(participantMap).length
                    };
                });

                setOnlineStatus(`Added 1 bot on ${result.side.toUpperCase()} side (slot ${result.slot}). Players now: ${result.totalCount}/${MAX_ROOM_PLAYERS}.`);
            } catch (error) {
                if (error && error.message === 'room-not-found') {
                    setOnlineStatus('Room no longer exists.', true);
                    return;
                }
                if (error && error.message === 'room-full') {
                    setOnlineStatus('No empty slots for bots. Room is already full.', true);
                    return;
                }
                console.error('Add one bot failed:', error);
                setOnlineStatus('Could not add bot.', true);
            }
        }

        async function removeOneBotFromRoom() {
            if (!online.active || !online.roomRef || !online.roomCode) {
                setOnlineStatus('Create or join a room first.', true);
                return;
            }
            if (online.localSeat !== 1) {
                setOnlineStatus('Only host can remove bots.', true);
                return;
            }

            try {
                const result = await db.runTransaction(async (tx) => {
                    const roomDoc = await tx.get(online.roomRef);
                    if (!roomDoc.exists) {
                        throw new Error('room-not-found');
                    }

                    const room = roomDoc.data() || {};
                    const participants = normalizeRoomParticipants(room);
                    const bots = participants
                        .filter((participant) => isBotUid(participant.uid))
                        .sort((a, b) => Number(b.slot) - Number(a.slot));

                    if (!bots.length) {
                        throw new Error('no-bots');
                    }

                    const botToRemove = bots[0];
                    const participantMap = { ...(room.participants || {}) };
                    const readyByUid = { ...(room.readyByUid || {}) };
                    delete participantMap[botToRemove.uid];
                    delete readyByUid[botToRemove.uid];

                    const hostReady = Boolean(room.hostUid && readyByUid[room.hostUid] === true);
                    const guestReady = Boolean(room.guestUid && readyByUid[room.guestUid] === true);

                    tx.update(online.roomRef, {
                        participants: participantMap,
                        readyByUid,
                        hostReady,
                        guestReady,
                        status: 'waiting',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    return {
                        slot: botToRemove.slot,
                        totalCount: Object.keys(participantMap).length
                    };
                });

                setOnlineStatus(`Removed 1 bot from slot ${result.slot}. Players now: ${result.totalCount}/${MAX_ROOM_PLAYERS}.`);
            } catch (error) {
                if (error && error.message === 'room-not-found') {
                    setOnlineStatus('Room no longer exists.', true);
                    return;
                }
                if (error && error.message === 'no-bots') {
                    setOnlineStatus('No bots to remove.', true);
                    return;
                }
                console.error('Remove one bot failed:', error);
                setOnlineStatus('Could not remove bot.', true);
            }
        }

        async function sendOnlineAction(player) {
            if (!online.active || !online.roomRef || online.applyingRemoteAction) {
                return;
            }
            const action = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                actorUid: online.localUid,
                player: game.currentPlayer,
                x: player.x,
                angle: player.angle,
                aimFacing: player.aimFacing,
                power: player.power,
                ts: Date.now()
            };
            online.lastProcessedActionId = action.id;
            try {
                await online.roomRef.set({
                    status: 'playing',
                    lastAction: action,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (error) {
                console.error('Failed to send action:', error);
                setOnlineStatus('Failed to sync shot action.', true);
            }
        }

        async function sendOnlineLiveState(player, force = false) {
            if (!online.active || !online.roomRef || online.applyingRemoteAction || !game.isRunning) {
                return;
            }

            const now = Date.now();
            const payload = {
                uid: online.localUid,
                player: game.currentPlayer,
                x: player.x,
                y: player.y,
                angle: player.angle,
                power: player.power,
                aimFacing: player.aimFacing,
                fuel: player.fuel,
                charging: Boolean(player.charging),
                ts: now
            };

            const signature = [
                payload.player,
                Math.round(payload.x),
                Math.round(payload.y),
                Math.round(payload.angle * 10),
                Math.round(payload.power),
                payload.aimFacing,
                Math.round(payload.fuel),
                payload.charging ? 1 : 0
            ].join(':');

            if (!force) {
                const minSyncGapMs = 80;
                if (signature === online.lastLiveSignature) {
                    return;
                }
                if (now - online.lastLiveSyncAt < minSyncGapMs) {
                    return;
                }
            }

            online.lastLiveSyncAt = now;
            online.lastLiveSignature = signature;

            const seatKey = game.currentPlayer === 1 ? 'p1' : 'p2';

            try {
                await online.roomRef.set({
                    liveState: {
                        [seatKey]: payload
                    }
                }, { merge: true });
            } catch (error) {
                // Keep gameplay smooth if transient sync writes fail.
            }
        }

        function applyRemoteLiveState(state) {
            if (!online.active || !game.isRunning || game.endSlowMo) {
                return;
            }

            const remoteSeat = getRemotePlayerSlot();
            if (state.player !== remoteSeat || game.currentPlayer !== remoteSeat) {
                return;
            }

            if (!Number.isFinite(state.ts) || state.ts <= online.lastAppliedLiveTs) {
                return;
            }

            const observedLatency = Math.max(0, Date.now() - state.ts);
            if (online.liveLatencyMs === null) {
                online.liveLatencyMs = observedLatency;
                online.liveJitterMs = 0;
            } else {
                const delta = Math.abs(observedLatency - online.liveLatencyMs);
                online.liveLatencyMs = online.liveLatencyMs * 0.78 + observedLatency * 0.22;
                online.liveJitterMs = online.liveJitterMs * 0.8 + delta * 0.2;
            }
            online.lastRemoteSeenAt = Date.now();

            online.lastAppliedLiveTs = state.ts;

            const player = remoteSeat === 1 ? player1 : player2;

            if (Number.isFinite(state.aimFacing)) {
                setPlayerFacingWithoutMirroring(player, state.aimFacing >= 0 ? 1 : -1);
            }
            if (Number.isFinite(state.x)) {
                player.x = Math.max(50, Math.min(WORLD_WIDTH - 50, state.x));
            }
            if (Number.isFinite(state.angle)) {
                player.angle = clampPlayerLocalAngle(player, state.angle);
            }
            if (Number.isFinite(state.power)) {
                player.power = Math.max(0, Math.min(100, state.power));
            }
            if (Number.isFinite(state.fuel)) {
                player.fuel = Math.max(0, Math.min(player.maxFuel, state.fuel));
            }
            player.charging = Boolean(state.charging);

            const surface = getSurfaceBelowY(player.x, player.y + 40);
            player.y = surface.y - 40;
            player.groundAngle = surface.slope;

            updateConnectionIndicator(true);
        }

        function applyRemoteAction(action) {
            if (!online.active || !game.isRunning) {
                return;
            }
            if (projectile || game.waitingForTurn || game.endSlowMo) {
                return;
            }
            if (action.player !== game.currentPlayer) {
                return;
            }

            const player = action.player === 1 ? player1 : player2;
            player.x = Math.max(50, Math.min(WORLD_WIDTH - 50, action.x));
            if (Number.isFinite(action.aimFacing)) {
                setPlayerFacingWithoutMirroring(player, action.aimFacing >= 0 ? 1 : -1);
            }
            player.angle = clampPlayerLocalAngle(player, action.angle);
            player.power = Math.max(1, Math.min(100, action.power));
            const surface = getSurfaceBelowY(player.x, player.y + 40);
            player.y = surface.y - 40;
            player.groundAngle = surface.slope;

            online.applyingRemoteAction = true;
            fire(player);
            online.applyingRemoteAction = false;
            player.power = 0;
        }

        function updateCamera(targetX) {
            const desired = Math.max(0, Math.min(WORLD_WIDTH - VIEW_WIDTH, targetX - VIEW_WIDTH / 2));
            if (game.cameraSnap) {
                camera.x = desired;
                game.cameraSnap = false;
                return;
            }
            camera.x += (desired - camera.x) * 0.08;
        }

        function randRange(min, max) {
            return min + Math.random() * (max - min);
        }

        function simulateBotShotError(actor, target, localAngle, power, effectiveWind) {
            const launchPower = power / 3.8;
            const worldAngle = localAngle + actor.groundAngle;
            const angleRad = (worldAngle * Math.PI) / 180;
            let x = actor.x;
            let y = actor.y - 20;
            let vx = Math.cos(angleRad) * launchPower;
            let vy = -Math.sin(angleRad) * launchPower;
            let bestDistanceSq = Infinity;

            for (let step = 0; step < 180; step++) {
                vy += 0.5;
                vx += effectiveWind * 0.015;
                x += vx;
                y += vy;

                const dx = x - target.x;
                const dy = y - (target.y - 20);
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq < bestDistanceSq) {
                    bestDistanceSq = distanceSq;
                }

                if (x < -80 || x > WORLD_WIDTH + 80 || y > WORLD_HEIGHT + 80) {
                    break;
                }
            }

            return bestDistanceSq;
        }

        function lerp(current, target, amount) {
            return current + (target - current) * amount;
        }

        function clampAngleDelta(current, target, maxDelta) {
            const delta = target - current;
            if (Math.abs(delta) <= maxDelta) {
                return target;
            }
            return current + Math.sign(delta) * maxDelta;
        }

        const VEHICLE_PROFILES = {
            catrket: {
                // Local aim arc for CatRket (slightly below horizon to below vertical).
                localAngleMin: -8,
                localAngleMax: 82
            },
            default: {
                localAngleMin: 10,
                localAngleMax: 170
            }
        };

        function getVehicleProfile(player) {
            return VEHICLE_PROFILES[player.vehicleType] || VEHICLE_PROFILES.default;
        }

        function getPlayerLocalAngleLimits(player) {
            const profile = getVehicleProfile(player);
            if (player.aimFacing === -1) {
                return {
                    min: 180 - profile.localAngleMax,
                    max: 180 - profile.localAngleMin
                };
            }
            return {
                min: profile.localAngleMin,
                max: profile.localAngleMax
            };
        }

        function clampPlayerLocalAngle(player, localAngle) {
            const limits = getPlayerLocalAngleLimits(player);
            return Math.max(limits.min, Math.min(limits.max, localAngle));
        }

        function setPlayerFacing(player, facing) {
            const normalizedFacing = facing >= 0 ? 1 : -1;
            if (player.aimFacing === normalizedFacing) {
                return;
            }
            player.aimFacing = normalizedFacing;
            // Mirror local angle when turning around so aim feels continuous.
            player.angle = clampPlayerLocalAngle(player, 180 - player.angle);
        }

        function setPlayerFacingWithoutMirroring(player, facing) {
            const normalizedFacing = facing >= 0 ? 1 : -1;
            player.aimFacing = normalizedFacing;
        }

        function getPlayerGlobalAngle(player) {
            return player.angle + player.groundAngle;
        }

        function getPlayerDisplayAngle(player) {
            // Keep UI angle consistent for both seats by mirroring left-facing local angles.
            return player.aimFacing === -1 ? 180 - player.angle : player.angle;
        }

        function setSpawnPositions() {
            if (forcedSpawnPositions && Number.isFinite(forcedSpawnPositions.p1x) && Number.isFinite(forcedSpawnPositions.p2x)) {
                player1.x = forcedSpawnPositions.p1x;
                player2.x = forcedSpawnPositions.p2x;
                return;
            }

            const spawnPair = pickSpawnPair();
            player1.x = spawnPair.p1x;
            player2.x = spawnPair.p2x;
        }

        function setNewWind() {
            // Wind changes a few times per match
            const maxStrength = 10;
            const direction = Math.random() < 0.5 ? -1 : 1;
            const strengthBias = Math.pow(Math.random(), 1.6); // bias toward lighter winds
            wind.target = direction * strengthBias * maxStrength;
            wind.changeTimer = 15 + Math.random() * 15; // 15-30 seconds
        }

        function updateWind(dt = 1) {
            // Ease current wind toward target
            const ease = 0.03 * dt;
            wind.strength += (wind.target - wind.strength) * ease;

            wind.changeTimer -= (1 / 60) * dt;
            if (wind.changeTimer <= 0) {
                setNewWind();
            }

            updateWindIndicator();
        }

        function updateWindIndicator() {
            const windValue = document.getElementById('windValue');
            const windArrow = document.getElementById('windArrow');
            if (!windValue || !windArrow) return;

            const displayValue = Math.abs(wind.strength).toFixed(0);
            windValue.textContent = displayValue;
            windArrow.textContent = wind.strength >= 0 ? '->' : '<-';
        }

        function getEffectiveWind() {
            // Strongly soften high wind values (0-10) for gameplay balance
            const magnitude = Math.abs(wind.strength);
            const scaled = Math.pow(magnitude / 10, 0.5) * 10;
            return Math.sign(wind.strength) * scaled * 0.5;
        }

        // Players
        const player1 = {
            x: 150,
            y: 0,
            vx: 0,
            vy: 0,
            vehicleType: 'catrket',
            aimFacing: 1,
            angle: 45,
            power: 0,
            health: 100,
            maxHealth: 100,
            fuel: 300,
            maxFuel: 300,
            color: '#4ecdc4',
            charging: false,
            vehicleColor: '#667eea',
            groundAngle: 0,
            shake: 0,
            shakeX: 0,
            shakeY: 0
        };

        const player2 = {
            x: 2150,
            y: 0,
            vx: 0,
            vy: 0,
            vehicleType: 'catrket',
            aimFacing: -1,
            angle: 135,
            power: 0,
            health: 100,
            maxHealth: 100,
            fuel: 300,
            maxFuel: 300,
            color: '#ff6b6b',
            charging: false,
            vehicleColor: '#764ba2',
            groundAngle: 0,
            shake: 0,
            shakeX: 0,
            shakeY: 0
        };

        const engineSound = createAudioElement(true, 0.35);
        const chargingSound = createAudioElement(true, 0.14);
        const shotSound = createAudioElement(false, 0.55);
        const impactVehicleSound = createAudioElement(false, 0.72);
        const impactGroundSound = createAudioElement(false, 0.5);
        const switchTurnSound = createAudioElement(false, 0.52);
        const matchEndSound = createAudioElement(false, 0.62);
        const bgmSound = createAudioElement(true, 0.25);
        const killingTimeBgmSound = createAudioElement(true, 0.27);
        const mapScanBgmSound = createAudioElement(true, 0.38);
        let gameplayBgmMode = 'off';

        const soundAssetsReady = Promise.all([
            loadAudioAsset(engineSound, 'sfx/car1.mp3'),
            loadAudioAsset(chargingSound, 'sfx/charging02.mp3'),
            loadAudioAsset(shotSound, 'sfx/shot01.mp3'),
            loadAudioAsset(impactVehicleSound, 'sfx/impact01.mp3'),
            loadAudioAsset(impactGroundSound, 'sfx/impact-ground01.mp3'),
            loadAudioAsset(switchTurnSound, 'sfx/switch-turn-02.mp3'),
            loadAudioAsset(matchEndSound, 'sfx/match-end.wav'),
            loadAudioAsset(bgmSound, 'bgm/bgm01.mp3'),
            loadAudioAsset(killingTimeBgmSound, 'bgm/killingtime.mp3'),
            loadAudioAsset(mapScanBgmSound, 'bgm/mapscan.mp3')
        ]);

        let chargingSoundActive = false;

        const sfxCue = {
            shot: 0,
            impactVehicle: 0,
            impactGround: 0,
            switchTurn: 0,
            matchEnd: 0
        };

        let soundUnlocked = false;
        let mapScanBgmRetryAt = 0;
        let previousVehicleX = {
            p1: player1.x,
            p2: player2.x
        };

        function fadeAudioVolume(sound, targetVolume, durationMs = 700, stopAtZero = false) {
            if (sound.__fadeRaf) {
                cancelAnimationFrame(sound.__fadeRaf);
                sound.__fadeRaf = null;
            }

            const startVolume = sound.volume;
            const startTime = performance.now();

            if (targetVolume > 0 && sound.paused) {
                sound.play().catch(() => {});
            }

            const tick = (now) => {
                const t = Math.min(1, (now - startTime) / Math.max(1, durationMs));
                sound.volume = startVolume + (targetVolume - startVolume) * t;

                if (t < 1) {
                    sound.__fadeRaf = requestAnimationFrame(tick);
                    return;
                }

                sound.__fadeRaf = null;
                sound.volume = targetVolume;

                if (stopAtZero && targetVolume <= 0.001) {
                    sound.pause();
                    sound.currentTime = 0;
                }
            };

            sound.__fadeRaf = requestAnimationFrame(tick);
        }

        function tryPlayMapScanBgm(force = false) {
            if (!soundUnlocked || !game.prematchScan.active) {
                return;
            }
            if (!mapScanBgmSound.paused) {
                return;
            }
            const now = performance.now();
            if (!force && now < mapScanBgmRetryAt) {
                return;
            }
            mapScanBgmRetryAt = now + 500;
            mapScanBgmSound.play().catch(() => {});
        }

        async function unlockSounds() {
            if (soundUnlocked) return;
            soundUnlocked = true;

            await soundAssetsReady.catch(() => {});

            // Do not pre-play sounds here; some browsers/extensions abort media requests on immediate play/pause.
            engineSound.currentTime = 0;
            chargingSound.currentTime = 0;
            shotSound.currentTime = sfxCue.shot;
            impactVehicleSound.currentTime = sfxCue.impactVehicle;
            impactGroundSound.currentTime = sfxCue.impactGround;
            switchTurnSound.currentTime = sfxCue.switchTurn;
            matchEndSound.currentTime = sfxCue.matchEnd;
            bgmSound.currentTime = 0;
            killingTimeBgmSound.currentTime = 0;
            mapScanBgmSound.currentTime = 0;
        }

        function playOneShot(sound, cueStart = 0) {
            if (!soundUnlocked || !game.isRunning || game.endSlowMo) {
                return;
            }

            try {
                sound.pause();
                sound.currentTime = Math.max(0, cueStart);
                sound.play().catch(() => {});
            } catch (error) {
                // Ignore transient playback errors.
            }
        }

        function setEngineSoundMoving(isMoving) {
            if (!soundUnlocked || !game.isRunning || game.endSlowMo) {
                if (!engineSound.paused) {
                    engineSound.pause();
                }
                return;
            }

            if (isMoving) {
                if (engineSound.paused) {
                    engineSound.play().catch(() => {});
                }
            } else if (!engineSound.paused) {
                engineSound.pause();
            }
        }

        function updateEngineSound() {
            const p1Moved = Math.abs(player1.x - previousVehicleX.p1) > 0.08;
            const p2Moved = Math.abs(player2.x - previousVehicleX.p2) > 0.08;
            setEngineSoundMoving(p1Moved || p2Moved);
            previousVehicleX.p1 = player1.x;
            previousVehicleX.p2 = player2.x;
        }

        function setChargingSoundActive(active) {
            if (!soundUnlocked || !game.isRunning || game.endSlowMo) {
                if (!chargingSound.paused) {
                    chargingSound.pause();
                    chargingSound.currentTime = 0;
                }
                chargingSound.playbackRate = 1;
                chargingSoundActive = false;
                return;
            }

            if (active && !chargingSoundActive) {
                chargingSoundActive = true;
                chargingSound.playbackRate = 0.72;
                chargingSound.currentTime = 0;
                chargingSound.play().catch(() => {});
            } else if (!active && chargingSoundActive) {
                chargingSoundActive = false;
                chargingSound.pause();
                chargingSound.currentTime = 0;
                chargingSound.playbackRate = 1;
            }
        }

        function updateChargingSound() {
            const isAnyPlayerCharging = (player1.charging || player2.charging) && !projectile;
            if (isAnyPlayerCharging !== chargingSoundActive) {
                setChargingSoundActive(isAnyPlayerCharging);
            }
        }

        function setGameplayBgmMode(mode) {
            if (!soundUnlocked || gameplayBgmMode === mode) {
                return;
            }

            gameplayBgmMode = mode;

            if (mode === 'normal') {
                if (bgmSound.paused) {
                    bgmSound.currentTime = 0;
                    bgmSound.volume = 0;
                    bgmSound.play().catch(() => {});
                }
                fadeAudioVolume(bgmSound, 0.25, 700, false);
                fadeAudioVolume(killingTimeBgmSound, 0, 500, true);
                return;
            }

            if (mode === 'killing-time') {
                if (killingTimeBgmSound.paused) {
                    killingTimeBgmSound.currentTime = 0;
                    killingTimeBgmSound.volume = 0;
                    killingTimeBgmSound.play().catch(() => {});
                }
                fadeAudioVolume(killingTimeBgmSound, 0.27, 700, false);
                fadeAudioVolume(bgmSound, 0, 500, true);
                return;
            }

            fadeAudioVolume(bgmSound, 0, 280, true);
            fadeAudioVolume(killingTimeBgmSound, 0, 280, true);
        }

        function updateBGM() {
            if (!soundUnlocked) return;

            if (!game.isRunning || game.endSlowMo) {
                setGameplayBgmMode('off');
                return;
            }

            setGameplayBgmMode(killingTime.active ? 'killing-time' : 'normal');
        }

        // Terrain
        const terrain = [];
        const terrainSegments = 60;

        const MAP01 = {
            ground: {
                width: 2272,
                height: 581,
                paths: [
                    {
                        d: "M109.118 403.325C55.5183 403.325 14.4516 515.284 0.618286 579.951H2270.62C2251.79 522.618 2200.42 416.538 2145.62 416.538C2077.12 416.538 2085.62 329.451 1998.62 329.451H1638.12C1489.62 329.451 1504.12 408.331 1273.62 408.331C1043.12 408.331 1076.62 350.172 862.618 350.172C714.618 350.172 712.618 383.805 607.618 383.805C502.618 383.805 448.118 429.451 397.118 429.451H256.118C185.618 429.451 176.118 403.325 109.118 403.325Z",
                        fill: "#9F5426",
                        stroke: "#E9B771",
                        role: "ground"
                    },
                    {
                        d: "M256.118 125.951C223.163 124.229 145.118 98.2596 130.118 131.451C106.618 183.451 164.118 227.451 192.618 227.451C221.118 227.451 347.118 229.951 390.618 227.451C434.118 224.951 466.618 78.451 426.118 78.451C399.15 78.4511 380.693 75.9986 351.618 83.9511C322.744 91.8488 300.027 128.245 256.118 125.951Z",
                        fill: "#9F5426",
                        stroke: "#E9B771",
                        role: "platform"
                    },
                    {
                        d: "M1425.62 9.95097C1408.12 22.451 1388.12 95.951 1410.12 104.451H1452.62C1467.12 104.451 1465.12 61.4509 1513.62 62.4509C1539.79 62.9904 1521.62 100.951 1537.12 100.951C1554.62 100.951 1604.09 101.181 1627.12 100.951C1654.57 100.676 1640.98 79.951 1632.12 47.451C1626.12 25.451 1617.62 0.950968 1594.62 0.95097C1550.62 0.950974 1443.12 -2.54903 1425.62 9.95097Z",
                        fill: "#9F5426",
                        stroke: "#E9B771",
                        role: "platform"
                    }
                ]
            },
            water: {
                width: 2401,
                height: 63,
                fill: "#6B9EA2",
                stroke: "#5AC4BF"
            }
        };

        const TILE_RULE_MAP = {
            rows: 14,
            cols: 48,
            baseRow: 8.5,
            roughness: 0.85,
            waveA: { amplitude: 1.6, frequency: 1.0, phase: 0.35 },
            waveB: { amplitude: 0.9, frequency: 2.15, phase: 1.1 },
            seed: 23,
            platforms: [
                { startCol: 6, endCol: 11, row: 5.2, thicknessRows: 0.7 },
                { startCol: 27, endCol: 33, row: 2.3, thicknessRows: 0.8 }
            ],
            waterLevel: 640
        };

        // Switch between 'svg' and 'tile' for fast map iteration.
        const ACTIVE_MAP_MODE = 'svg';

        const uniformTerrainScale = Math.min(
            WORLD_WIDTH / MAP01.ground.width,
            WORLD_HEIGHT / MAP01.ground.height
        );
        const terrainScaleX = uniformTerrainScale;
        const terrainScaleY = uniformTerrainScale;
        const mapOffsetX = (WORLD_WIDTH - MAP01.ground.width * uniformTerrainScale) / 2;
        const mapOffsetY = WORLD_HEIGHT - MAP01.ground.height * uniformTerrainScale;

        const waterHeight = MAP01.water.height * uniformTerrainScale;

        // Projectile
        let projectile = null;

        // Craters system
        let craters = [];

        // Water level
        let WATER_LEVEL = Math.round(WORLD_HEIGHT - waterHeight);
        let BASE_WATER_LEVEL = WATER_LEVEL;

        const mapPathObjects = MAP01.ground.paths.map(path => ({
            ...path,
            path2d: new Path2D(path.d)
        }));

        const groundStyle = {
            fill: MAP01.ground.paths[0].fill,
            stroke: MAP01.ground.paths[0].stroke
        };

        function buildTileTerrainFromRules(rules) {
            const cols = rules.cols || 48;
            const rows = rules.rows || 14;
            const tileWidth = WORLD_WIDTH / cols;
            const tileHeight = WORLD_HEIGHT / rows;

            const heights = new Array(WORLD_WIDTH + 1).fill(WORLD_HEIGHT);
            const colRows = [];

            for (let c = 0; c < cols; c++) {
                const t = c / cols;
                const n = Math.sin((c + 1) * 12.9898 + (rules.seed || 7) * 78.233) * 43758.5453;
                const noise = (n - Math.floor(n)) * 2 - 1;

                let row = rules.baseRow || 8.5;
                const wA = rules.waveA || { amplitude: 1.5, frequency: 1, phase: 0 };
                const wB = rules.waveB || { amplitude: 1.0, frequency: 2.2, phase: 0.8 };

                row += Math.sin(t * Math.PI * 2 * wA.frequency + wA.phase) * wA.amplitude;
                row += Math.sin(t * Math.PI * 2 * wB.frequency + wB.phase) * wB.amplitude;
                row += noise * (rules.roughness || 0.7);
                row = Math.max(3, Math.min(rows - 2, row));

                colRows.push(row);
            }

            for (let c = 0; c < cols; c++) {
                const y = colRows[c] * tileHeight;
                const start = Math.floor(c * tileWidth);
                const end = Math.min(WORLD_WIDTH, Math.ceil((c + 1) * tileWidth));
                for (let x = start; x <= end; x++) {
                    heights[x] = y;
                }
            }

            return heights;
        }

        function createTilePlatformBands(rules) {
            const cols = rules.cols || 48;
            const rows = rules.rows || 14;
            const tileWidth = WORLD_WIDTH / cols;
            const tileHeight = WORLD_HEIGHT / rows;

            const top = new Array(WORLD_WIDTH + 1).fill(null);
            const bottom = new Array(WORLD_WIDTH + 1).fill(null);

            (rules.platforms || []).forEach(platform => {
                const start = Math.max(0, Math.floor(platform.startCol * tileWidth));
                const end = Math.min(WORLD_WIDTH, Math.ceil((platform.endCol + 1) * tileWidth));
                const topY = platform.row * tileHeight;
                const bottomY = topY + (platform.thicknessRows || 0.8) * tileHeight;
                for (let x = start; x <= end; x++) {
                    top[x] = topY;
                    bottom[x] = bottomY;
                }
            });

            return [{
                role: 'platform',
                fill: groundStyle.fill,
                stroke: groundStyle.stroke,
                bands: { top, bottom }
            }];
        }

        // Initialize terrain
        function buildTerrainFromSvgPath(pathData, fillGaps = true) {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', pathData);
            svg.appendChild(path);

            const totalLength = path.getTotalLength();
            const sampleCount = Math.max(800, WORLD_WIDTH * 3);
            const heights = new Array(WORLD_WIDTH + 1).fill(null);

            for (let i = 0; i <= sampleCount; i++) {
                const point = path.getPointAtLength((totalLength * i) / sampleCount);
                const x = point.x * terrainScaleX + mapOffsetX;
                const y = point.y * terrainScaleY + mapOffsetY;
                const xi = Math.round(x);
                if (xi < 0 || xi > WORLD_WIDTH) {
                    continue;
                }
                const current = heights[xi];
                heights[xi] = current === null ? y : Math.min(current, y);
            }

            if (fillGaps) {
                let last = null;
                for (let i = 0; i < heights.length; i++) {
                    if (heights[i] === null) {
                        heights[i] = last;
                    } else {
                        last = heights[i];
                    }
                }
                for (let i = heights.length - 1; i >= 0; i--) {
                    if (heights[i] === null) {
                        heights[i] = last;
                    } else {
                        last = heights[i];
                    }
                }
            }

            return heights;
        }

        function buildSurfaceHeightsContinuous(pathData) {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', pathData);
            svg.appendChild(path);

            const totalLength = path.getTotalLength();
            const sampleCount = Math.max(1200, WORLD_WIDTH * 4);
            const heights = new Array(WORLD_WIDTH + 1).fill(null);

            let prev = null;
            for (let i = 0; i <= sampleCount; i++) {
                const point = path.getPointAtLength((totalLength * i) / sampleCount);
                const x = point.x * terrainScaleX + mapOffsetX;
                const y = point.y * terrainScaleY + mapOffsetY;
                const xi = Math.round(x);
                if (xi < 0 || xi > WORLD_WIDTH) {
                    prev = { x, y };
                    continue;
                }

                if (prev) {
                    const startX = Math.max(0, Math.round(Math.min(prev.x, x)));
                    const endX = Math.min(WORLD_WIDTH, Math.round(Math.max(prev.x, x)));
                    const dx = x - prev.x;
                    for (let sx = startX; sx <= endX; sx++) {
                        const t = dx === 0 ? 0 : (sx - prev.x) / dx;
                        const yVal = prev.y + (y - prev.y) * t;
                        const current = heights[sx];
                        heights[sx] = current === null ? yVal : Math.min(current, yVal);
                    }
                } else {
                    heights[xi] = y;
                }

                prev = { x, y };
            }

            return heights;
        }

        function fillShortGaps(heights, maxGap = 6) {
            let lastIndex = null;
            for (let i = 0; i < heights.length; i++) {
                if (heights[i] !== null && heights[i] !== undefined) {
                    if (lastIndex !== null) {
                        const gap = i - lastIndex - 1;
                        if (gap > 0 && gap <= maxGap) {
                            const start = heights[lastIndex];
                            const end = heights[i];
                            for (let g = 1; g <= gap; g++) {
                                const t = g / (gap + 1);
                                heights[lastIndex + g] = start + (end - start) * t;
                            }
                        }
                    }
                    lastIndex = i;
                }
            }
        }

        function fillSurfaceSpan(heights) {
            let first = null;
            let last = null;
            for (let i = 0; i < heights.length; i++) {
                if (heights[i] !== null && heights[i] !== undefined) {
                    first = i;
                    break;
                }
            }
            for (let i = heights.length - 1; i >= 0; i--) {
                if (heights[i] !== null && heights[i] !== undefined) {
                    last = i;
                    break;
                }
            }
            if (first === null || last === null) {
                return;
            }

            // Find all non-null indices and interpolate between consecutive pairs
            let prevIndex = first;
            for (let i = first + 1; i <= last; i++) {
                if (heights[i] !== null && heights[i] !== undefined) {
                    // Found the next non-null value, interpolate the gap
                    const gapStart = prevIndex + 1;
                    const gapEnd = i - 1;
                    const prevValue = heights[prevIndex];
                    const nextValue = heights[i];
                    const gapSize = i - prevIndex;
                    
                    for (let j = gapStart; j <= gapEnd; j++) {
                        const t = (j - prevIndex) / gapSize;
                        heights[j] = prevValue + (nextValue - prevValue) * t;
                    }
                    
                    prevIndex = i;
                }
            }
        }

        function sampleSvgPathPoints(pathData, sampleCount = Math.max(700, Math.floor(WORLD_WIDTH * 1.5))) {
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', pathData);
            svg.appendChild(path);

            const totalLength = path.getTotalLength();
            const points = [];

            for (let i = 0; i <= sampleCount; i++) {
                const point = path.getPointAtLength((totalLength * i) / sampleCount);
                points.push({
                    x: point.x * terrainScaleX + mapOffsetX,
                    y: point.y * terrainScaleY + mapOffsetY
                });
            }

            return points;
        }

        function buildPathFromPoints(points) {
            const path = new Path2D();
            if (!points.length) {
                return path;
            }

            path.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                path.lineTo(points[i].x, points[i].y);
            }
            path.closePath();
            return path;
        }

        function buildSmoothClosedPath(points) {
            const path = new Path2D();
            if (points.length < 3) {
                return buildPathFromPoints(points);
            }

            const midPoint = (a, b) => ({
                x: (a.x + b.x) * 0.5,
                y: (a.y + b.y) * 0.5
            });

            const firstMid = midPoint(points[0], points[1]);
            path.moveTo(firstMid.x, firstMid.y);

            for (let i = 1; i < points.length; i++) {
                const current = points[i];
                const next = points[(i + 1) % points.length];
                const nextMid = midPoint(current, next);
                path.quadraticCurveTo(current.x, current.y, nextMid.x, nextMid.y);
            }

            path.closePath();
            return path;
        }

        function rebuildPlatformBodyGeometry(body) {
            const top = new Array(WORLD_WIDTH + 1).fill(null);
            const bottom = new Array(WORLD_WIDTH + 1).fill(null);

            const registerPoint = (px, py) => {
                if (px < 0 || px > WORLD_WIDTH) {
                    return;
                }
                const currentTop = top[px];
                const currentBottom = bottom[px];
                top[px] = currentTop === null ? py : Math.min(currentTop, py);
                bottom[px] = currentBottom === null ? py : Math.max(currentBottom, py);
            };

            for (let i = 0; i < body.points.length; i++) {
                const prev = body.points[i];
                const next = body.points[(i + 1) % body.points.length];
                const startX = Math.max(0, Math.round(Math.min(prev.x, next.x)));
                const endX = Math.min(WORLD_WIDTH, Math.round(Math.max(prev.x, next.x)));
                const dx = next.x - prev.x;

                if (startX === endX) {
                    registerPoint(Math.round(prev.x), prev.y);
                    registerPoint(Math.round(next.x), next.y);
                    continue;
                }

                for (let sx = startX; sx <= endX; sx++) {
                    const t = dx === 0 ? 0 : (sx - prev.x) / dx;
                    const yVal = prev.y + (next.y - prev.y) * t;
                    registerPoint(sx, yVal);
                }
            }

            fillShortGaps(top, 25);
            fillShortGaps(bottom, 25);
            fillSurfaceSpan(top);
            fillSurfaceSpan(bottom);

            body.path2d = buildSmoothClosedPath(body.points);
            body.surfaceTop = top;
            body.surfaceBottom = bottom;
            body.centerY = body.points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, body.points.length);
        }

        function buildPlatformBody(pathMeta) {
            const body = {
                ...pathMeta,
                originalPath2d: pathMeta.path2d,
                isDeformed: false,
                points: sampleSvgPathPoints(pathMeta.d)
            };
            rebuildPlatformBodyGeometry(body);
            return body;
        }

        function rebuildPlatformPointsFromBands(platform, sampleStep = 2) {
            let left = null;
            let right = null;

            for (let i = 0; i < platform.surfaceTop.length; i++) {
                if (platform.surfaceTop[i] !== null && platform.surfaceBottom[i] !== null
                    && platform.surfaceTop[i] !== undefined && platform.surfaceBottom[i] !== undefined) {
                    left = i;
                    break;
                }
            }

            for (let i = platform.surfaceTop.length - 1; i >= 0; i--) {
                if (platform.surfaceTop[i] !== null && platform.surfaceBottom[i] !== null
                    && platform.surfaceTop[i] !== undefined && platform.surfaceBottom[i] !== undefined) {
                    right = i;
                    break;
                }
            }

            if (left === null || right === null || right - left < 2) {
                return;
            }

            const topPoints = [];
            const bottomPoints = [];

            for (let x = left; x <= right; x += sampleStep) {
                const topY = platform.surfaceTop[x];
                const bottomY = platform.surfaceBottom[x];
                if (topY === null || bottomY === null || topY === undefined || bottomY === undefined) {
                    continue;
                }
                topPoints.push({ x, y: topY });
            }

            for (let x = right; x >= left; x -= sampleStep) {
                const topY = platform.surfaceTop[x];
                const bottomY = platform.surfaceBottom[x];
                if (topY === null || bottomY === null || topY === undefined || bottomY === undefined) {
                    continue;
                }
                bottomPoints.push({ x, y: bottomY });
            }

            // Ensure both ends are represented to avoid tiny open seams.
            if (!topPoints.length || !bottomPoints.length) {
                return;
            }
            if (topPoints[topPoints.length - 1].x !== right) {
                topPoints.push({ x: right, y: platform.surfaceTop[right] });
            }
            if (bottomPoints[0].x !== right) {
                bottomPoints.unshift({ x: right, y: platform.surfaceBottom[right] });
            }
            if (bottomPoints[bottomPoints.length - 1].x !== left) {
                bottomPoints.push({ x: left, y: platform.surfaceBottom[left] });
            }
            if (topPoints[0].x !== left) {
                topPoints.unshift({ x: left, y: platform.surfaceTop[left] });
            }

            platform.points = topPoints.concat(bottomPoints);
            rebuildPlatformBodyGeometry(platform);
        }

        function splitPlatformByDisconnectedSpans(platform, minSpanWidth = 10) {
            const spans = [];
            let spanStart = null;

            for (let x = 0; x <= WORLD_WIDTH; x++) {
                const topY = platform.surfaceTop[x];
                const bottomY = platform.surfaceBottom[x];
                const solid = topY !== null && topY !== undefined && bottomY !== null && bottomY !== undefined;

                if (solid && spanStart === null) {
                    spanStart = x;
                } else if (!solid && spanStart !== null) {
                    const spanEnd = x - 1;
                    if (spanEnd - spanStart + 1 >= minSpanWidth) {
                        spans.push({ start: spanStart, end: spanEnd });
                    }
                    spanStart = null;
                }
            }

            if (spanStart !== null) {
                const spanEnd = WORLD_WIDTH;
                if (spanEnd - spanStart + 1 >= minSpanWidth) {
                    spans.push({ start: spanStart, end: spanEnd });
                }
            }

            if (spans.length <= 1) {
                // No true split yet, but geometry still changed and must redraw immediately.
                rebuildPlatformPointsFromBands(platform);
                return [platform];
            }

            return spans.map(span => {
                const top = new Array(WORLD_WIDTH + 1).fill(null);
                const bottom = new Array(WORLD_WIDTH + 1).fill(null);

                for (let x = span.start; x <= span.end; x++) {
                    top[x] = platform.surfaceTop[x];
                    bottom[x] = platform.surfaceBottom[x];
                }

                const piece = {
                    ...platform,
                    isDeformed: true,
                    points: [],
                    surfaceTop: top,
                    surfaceBottom: bottom
                };

                rebuildPlatformPointsFromBands(piece);
                return piece;
            });
        }

        function isPointInPolygon(points, x, y) {
            let inside = false;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const xi = points[i].x;
                const yi = points[i].y;
                const xj = points[j].x;
                const yj = points[j].y;

                const intersects = ((yi > y) !== (yj > y))
                    && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.00001) + xi);
                if (intersects) {
                    inside = !inside;
                }
            }
            return inside;
        }


        function initTerrain() {
            terrain.length = 0;
            if (ACTIVE_MAP_MODE === 'tile') {
                const tileHeights = buildTileTerrainFromRules(TILE_RULE_MAP);
                terrain.push(...tileHeights.map((y, x) => ({ x, y })));
                WATER_LEVEL = TILE_RULE_MAP.waterLevel || WATER_LEVEL;
                platformBodies = [];
            } else {
                const groundPath = MAP01.ground.paths.find(path => path.role === 'ground');
                if (groundPath) {
                    const groundHeights = buildTerrainFromSvgPath(groundPath.d, true);
                    terrain.push(...groundHeights.map((y, x) => ({
                        x,
                        y: y === null ? WORLD_HEIGHT : y
                    })));
                }

                WATER_LEVEL = Math.round(WORLD_HEIGHT - waterHeight);
                platformBodies = mapPathObjects
                    .filter(path => path.role === 'platform')
                    .map(buildPlatformBody);
            }

            BASE_WATER_LEVEL = WATER_LEVEL;

            setSpawnPositions();

            smoothTerrain(1, 0.2);

            // Position players on terrain
            player1.y = getTerrainHeight(player1.x) - 40;
            player1.groundAngle = getSurfaceBelowY(player1.x, player1.y + 40).slope;

            player2.y = getTerrainHeight(player2.x) - 40;
            player2.groundAngle = getSurfaceBelowY(player2.x, player2.y + 40).slope;
        }

        function getTerrainHeight(x) {
            for (let i = 0; i < terrain.length - 1; i++) {
                if (x >= terrain[i].x && x <= terrain[i + 1].x) {
                    const ratio = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
                    return terrain[i].y + (terrain[i + 1].y - terrain[i].y) * ratio;
                }
            }
            return terrain[terrain.length - 1].y;
        }

        function getTerrainSlope(x) {
            const window = 8;
            const leftX = Math.max(0, x - window);
            const rightX = Math.min(WORLD_WIDTH, x + window);
            const leftY = getTerrainHeight(leftX);
            const rightY = getTerrainHeight(rightX);
            const dx = rightX - leftX;
            if (dx === 0) {
                return 0;
            }
            const dy = rightY - leftY;
            // Negate because in canvas +y is down, we want uphill to be positive
            return -Math.atan2(dy, dx) * 180 / Math.PI;
        }

        let platformBodies = [];

        function isPointInPlatform(x, y) {
            return platformBodies.some(platform => isPointInPolygon(platform.points, x, y));
        }

        function getPlatformSurfaceAt(x, yThreshold) {
            const xi = Math.round(x);
            let best = null;

            platformBodies.forEach(platform => {
                const height = platform.surfaceTop[xi];
                if (height === null || height === undefined) {
                    return;
                }
                if (height >= yThreshold) {
                    if (!best || height < best.y) {
                        const left = platform.surfaceTop[Math.max(0, xi - 1)];
                        const right = platform.surfaceTop[Math.min(WORLD_WIDTH, xi + 1)];
                        let slope = 0;
                        if (left !== null && right !== null && left !== undefined && right !== undefined) {
                            const dy = right - left;
                            slope = -Math.atan2(dy, 2) * 180 / Math.PI;
                        }
                        best = { y: height, slope, source: 'platform' };
                    }
                }
            });

            return best;
        }

        function getSurfaceBelowY(x, yThreshold) {
            const groundY = getTerrainHeight(x);
            let best = null;

            if (groundY >= yThreshold) {
                best = { y: groundY, slope: getTerrainSlope(x), source: 'ground' };
            }

            const platformSurface = getPlatformSurfaceAt(x, yThreshold);
            if (platformSurface && (!best || platformSurface.y < best.y)) {
                best = platformSurface;
            }

            if (!best) {
                return { y: groundY, slope: getTerrainSlope(x), source: 'ground' };
            }

            return best;
        }

        function startGameCore(isOnlineStart = false, killingTimeStart = false) {
            document.getElementById('startScreen').style.display = 'none';
            game.prematchScan.active = false;
            if (soundUnlocked) {
                gameplayBgmMode = 'off';
                killingTimeBgmSound.pause();
                killingTimeBgmSound.currentTime = 0;
                killingTimeBgmSound.volume = 0;
                bgmSound.pause();
                bgmSound.currentTime = 0;
                bgmSound.volume = 0;
                bgmSound.play().catch(() => {});
                fadeAudioVolume(bgmSound, 0.25, 900, false);
                fadeAudioVolume(mapScanBgmSound, 0, 750, true);
            } else {
                killingTimeBgmSound.pause();
                killingTimeBgmSound.currentTime = 0;
                mapScanBgmSound.pause();
                mapScanBgmSound.currentTime = 0;
            }
            game.isRunning = true;
            game.matchStartedAtMs = Date.now();
            game.matchElapsedMs = 0;
            game.turnTimeLeft = game.maxTurnTime;
            game.cameraSnap = true;
            game.currentPlayer = 1;
            game.waitingForTurn = false;
            game.turnDelay = 0;
            game.winner = null;
            game.endSlowMo = false;
            game.timeScale = 1;
            game.cameraHoldX = null;
            game.botThinking = false;
            resetKillingTime();
            if (online.active) {
                initOnlineCombatRoster();
            } else {
                resetOnlineCombatState();
            }
            previousVehicleX.p1 = player1.x;
            previousVehicleX.p2 = player2.x;
            unlockSounds();
            updateTurnTimer();
            updateTurnIndicator();
            updateMatchClock(0);
            if (isOnlineStart || online.active) {
                wind.strength = 0;
                wind.target = 0;
                wind.changeTimer = 999999;
            } else {
                setNewWind();
            }
            updateWindIndicator();

            if (killingTimeStart) {
                activateKillingTimeNow(Date.now());
            }
            
            // Record play count
            const playKey = 'game_plays_gunrider';
            const currentCount = parseInt(localStorage.getItem(playKey) || '0');
            localStorage.setItem(playKey, currentCount + 1);

            const localPlayerObj = getLocalPlayerSlot() === 1 ? player1 : player2;
            if (online.active) {
                sendOnlineLiveState(localPlayerObj, true);
            }
        }

        function resetMatchState() {
            projectile = null;
            explosionParticles = [];
            craters = [];
            resetAimInput();
            chargeInput.releaseQueued = false;
            chargeInput.owner = null;

            player1.health = player1.maxHealth;
            player2.health = player2.maxHealth;
            player1.fuel = player1.maxFuel;
            player2.fuel = player2.maxFuel;
            player1.power = 0;
            player2.power = 0;
            player1.charging = false;
            player2.charging = false;
            player1.vx = 0;
            player1.vy = 0;
            player2.vx = 0;
            player2.vy = 0;
            player1.shake = 0;
            player2.shake = 0;
            player1.shakeX = 0;
            player1.shakeY = 0;
            player2.shakeX = 0;
            player2.shakeY = 0;
            player1.deadFadeUntilMs = 0;
            player2.deadFadeUntilMs = 0;
            player1.aimFacing = 1;
            player2.aimFacing = -1;
            player1.angle = 45;
            player2.angle = 135;

            game.isRunning = false;
            game.winner = null;
            game.matchStartedAtMs = 0;
            game.matchElapsedMs = 0;
            game.endSlowMo = false;
            game.timeScale = 1;
            game.waitingForTurn = false;
            game.turnDelay = 0;
            game.maxTurnTime = 12;
            game.turnTimeLeft = game.maxTurnTime;
            game.cameraHoldX = null;
            game.cameraShake = 0;
            game.cameraShakeX = 0;
            game.cameraShakeY = 0;

            resetOnlineCombatState();

            resetKillingTime();
            updateMatchClock(0);

            setEngineSoundMoving(false);
            setChargingSoundActive(false);
            updateTurnIndicator();
            updateTurnTimer();
        }

        async function playAgain() {
            document.getElementById('gameOverScreen').style.display = 'none';

            if (online.active && online.roomRef) {
                if (online.localSeat === 1) {
                    const settings = getSpawnSettings();
                    try {
                        await online.roomRef.set({
                            status: 'waiting',
                            settings,
                            killingTimeStart: false,
                            lastAction: null,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        online.settings = settings;
                    } catch (error) {
                        setOnlineStatus('Could not prepare rematch room state.', true);
                    }
                }

                resetMatchState();
                forcedSpawnPositions = null;
                initTerrain();
                document.getElementById('startScreen').style.display = 'flex';
                setOnlineStatus(online.localSeat === 1
                    ? 'Rematch ready. Press START GAME when both players are ready.'
                    : 'Rematch requested. Waiting for host to start.');
                return;
            }

            resetMatchState();
            forcedSpawnPositions = null;
            initTerrain();
            startPrematchScan(false, false);
        }

        function startPrematchScan(isOnlineStart = false, killingTimeStart = false) {
            document.getElementById('startScreen').style.display = 'none';
            game.isRunning = false;

            // Build the roster before scan so all online participants are visible during intro.
            if (online.active) {
                initOnlineCombatRoster();
            }

            game.prematchScan.active = true;
            unlockSounds();
            game.prematchScan.startedAt = performance.now();
            game.prematchScan.durationMs = 3400 + Math.random() * 1400;
            game.prematchScan.isOnlineStart = isOnlineStart;
            game.prematchScan.killingTimeStart = Boolean(killingTimeStart);
            game.prematchScan.phase = 'sweep';
            game.prematchScan.returnStartedAt = 0;
            game.prematchScan.returnDurationMs = 0;
            const reverseSweep = Boolean(isOnlineStart && getLocalPlayerSlot() === 2);
            game.prematchScan.focusPlayer = reverseSweep ? 2 : 1;
            game.prematchScan.sweepFromX = reverseSweep ? (WORLD_WIDTH - VIEW_WIDTH) : 0;
            game.prematchScan.sweepToX = reverseSweep ? 0 : (WORLD_WIDTH - VIEW_WIDTH);
            game.prematchScan.returnFromX = game.prematchScan.sweepToX;
            game.prematchScan.returnTargetX = 0;
            game.cameraShake = 0;
            game.cameraShakeX = 0;
            game.cameraShakeY = 0;
            game.cameraHoldX = null;
            camera.x = game.prematchScan.sweepFromX;

            // Keep opening scan quiet; gameplay BGM starts only after scan ends.
            gameplayBgmMode = 'off';
            fadeAudioVolume(bgmSound, 0, 350, true);
            fadeAudioVolume(killingTimeBgmSound, 0, 350, true);
            mapScanBgmSound.pause();
            mapScanBgmSound.currentTime = 0;
            mapScanBgmSound.volume = 0.38;
            mapScanBgmSound.play().catch(() => {});
            tryPlayMapScanBgm(true);
        }

        async function startGame(forceKillingTime = false) {
            if (online.active) {
                if (!online.roomRef) {
                    setOnlineStatus('Room connection is missing.', true);
                    return;
                }

                if (!online.readyToStart) {
                    setOnlineStatus('All joined players must be ready before starting.', true);
                    return;
                }

                if (online.localSeat === 1) {
                    try {
                        await online.roomRef.set({
                            status: 'playing',
                            killingTimeStart: Boolean(forceKillingTime),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    } catch (error) {
                        console.error('Failed to start match:', error);
                        setOnlineStatus('Could not start online match.', true);
                        return;
                    }
                } else {
                    setOnlineStatus('Waiting for host to start...');
                    return;
                }
            } else {
                forcedSpawnPositions = null;
                initTerrain();
                startPrematchScan(false, Boolean(forceKillingTime));
            }
        }

        function startKillingTimeMode() {
            startGame(true);
        }

        // Input handling
        const keys = {};
        const aimInput = {
            upHeld: false,
            downHeld: false,
            upStartedAt: 0,
            downStartedAt: 0,
            lastUpStepAt: 0,
            lastDownStepAt: 0,
            repeatDelayMs: 180,
            repeatIntervalMs: 50
        };

        function resetAimInput() {
            aimInput.upHeld = false;
            aimInput.downHeld = false;
            aimInput.upStartedAt = 0;
            aimInput.downStartedAt = 0;
            aimInput.lastUpStepAt = 0;
            aimInput.lastDownStepAt = 0;
        }

        function applyAimStep(player, direction) {
            const isUp = direction === 'up';
            const delta = player.aimFacing === -1
                ? (isUp ? -1 : 1)
                : (isUp ? 1 : -1);
            player.angle = clampPlayerLocalAngle(player, player.angle + delta);
        }

        function updateAimInput(player, canControlCurrentTurn) {
            if (!canControlCurrentTurn || game.waitingForTurn || game.endSlowMo || keys['ArrowLeft'] || keys['ArrowRight']) {
                return;
            }

            const now = Date.now();

            if (aimInput.upHeld && !aimInput.downHeld) {
                if (aimInput.upStartedAt === 0) {
                    aimInput.upStartedAt = now;
                    aimInput.lastUpStepAt = now;
                    applyAimStep(player, 'up');
                } else if (now - aimInput.upStartedAt >= aimInput.repeatDelayMs
                    && now - aimInput.lastUpStepAt >= aimInput.repeatIntervalMs) {
                    applyAimStep(player, 'up');
                    aimInput.lastUpStepAt = now;
                }
            }

            if (aimInput.downHeld && !aimInput.upHeld) {
                if (aimInput.downStartedAt === 0) {
                    aimInput.downStartedAt = now;
                    aimInput.lastDownStepAt = now;
                    applyAimStep(player, 'down');
                } else if (now - aimInput.downStartedAt >= aimInput.repeatDelayMs
                    && now - aimInput.lastDownStepAt >= aimInput.repeatIntervalMs) {
                    applyAimStep(player, 'down');
                    aimInput.lastDownStepAt = now;
                }
            }
        }

        const chargeInput = {
            releaseQueued: false,
            owner: null
        };

        function isSpaceKey(event) {
            return event.code === 'Space' || event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar';
        }

        window.addEventListener('keydown', (e) => {
            keys[e.key] = true;
            
            // Prevent default browser scrolling for arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }

            if (e.key === 'ArrowUp' && !aimInput.upHeld) {
                aimInput.upHeld = true;
                aimInput.upStartedAt = 0;
                aimInput.lastUpStepAt = 0;
            }

            if (e.key === 'ArrowDown' && !aimInput.downHeld) {
                aimInput.downHeld = true;
                aimInput.downStartedAt = 0;
                aimInput.lastDownStepAt = 0;
            }
            
            if (isSpaceKey(e) && game.isRunning && !projectile) {
                e.preventDefault();
                const canControlTurn = isLocalTurnOwner();
                if (!canControlTurn || game.waitingForTurn || game.endSlowMo) {
                    return;
                }
                const currentPlayerObj = game.currentPlayer === 1 ? player1 : player2;
                if (!currentPlayerObj.charging && currentPlayerObj.power < 100) {
                    currentPlayerObj.charging = true;
                    chargeInput.owner = game.currentPlayer;
                    chargeInput.releaseQueued = false;
                    setChargingSoundActive(true);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            keys[e.key] = false;
            
            // Prevent default browser scrolling for arrow keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }

            if (e.key === 'ArrowUp') {
                aimInput.upHeld = false;
                aimInput.upStartedAt = 0;
                aimInput.lastUpStepAt = 0;
            }

            if (e.key === 'ArrowDown') {
                aimInput.downHeld = false;
                aimInput.downStartedAt = 0;
                aimInput.lastDownStepAt = 0;
            }
            
            if (isSpaceKey(e) && game.isRunning) {
                e.preventDefault();
                const canControlTurn = isLocalTurnOwner();
                if (!canControlTurn || game.waitingForTurn || game.endSlowMo) {
                    return;
                }
                const currentPlayerObj = game.currentPlayer === 1 ? player1 : player2;
                if (currentPlayerObj.charging) {
                    chargeInput.releaseQueued = true;
                }
            }
        });

        function fire(player) {
            setChargingSoundActive(false);
            chargeInput.releaseQueued = false;
            chargeInput.owner = null;
            
            // Check if this shot will be the final shot (opponent will die)
            const otherPlayer = player === player1 ? player2 : player1;
            const estimatedDamage = getDamageWithModifiers(online.active ? 28 : (20 + Math.random() * 15));
            const isFinalShot = otherPlayer.health - estimatedDamage <= 0;
            
            // Play shot sound with slow-mo effect if it's the final shot
            if (isFinalShot && shotSound.playbackRate !== undefined) {
                shotSound.playbackRate = 0.7; // Slow down the shot sound
                playOneShot(shotSound, sfxCue.shot);
                // Reset playback rate for next shot
                setTimeout(() => { shotSound.playbackRate = 1; }, 200);
            } else {
                shotSound.playbackRate = 1;
                playOneShot(shotSound, sfxCue.shot);
            }
            
            // Barrel uses player.angle in rotated canvas
            // World angle = player.angle + player.groundAngle (shown in display)
            // But for projectile physics, convert the displayed world angle back
            const worldAngle = getPlayerGlobalAngle(player);
            const angleRad = (worldAngle * Math.PI) / 180;
            const velocity = player.power / 3.8;
            
            projectile = {
                x: player.x,
                y: player.y - 20,
                vx: Math.cos(angleRad) * velocity,
                vy: -Math.sin(angleRad) * velocity,
                radius: 8,
                trail: []
            };

            if (online.active && !online.applyingRemoteAction) {
                sendOnlineAction(player);
            }
            
            player.power = 0;
        }

        function updateProjectile(dt = 1) {
            if (!projectile) return;
            
            // Add to trail
            projectile.trail.push({ x: projectile.x, y: projectile.y });
            if (projectile.trail.length > 20) projectile.trail.shift();
            
            // Physics
            const effectiveWind = getEffectiveWind();
            projectile.vy += 0.5 * dt; // Gravity
            projectile.vx += effectiveWind * 0.015 * dt; // Wind (half)
            projectile.x += projectile.vx * dt;
            projectile.y += projectile.vy * dt;
            
            // Check platform collision
            if (isPointInPlatform(projectile.x, projectile.y)) {
                playOneShot(impactGroundSound, sfxCue.impactGround);
                createExplosion(projectile.x, projectile.y);
                createPlatformCrater(projectile.x, projectile.y);
                checkHit(projectile.x, projectile.y);
                game.cameraHoldX = Math.max(0, Math.min(WORLD_WIDTH, projectile.x));
                projectile = null;
                switchTurn();
                return;
            }

            // Check terrain collision
            const surface = getSurfaceBelowY(projectile.x, projectile.y);
            if (projectile.y >= surface.y) {
                playOneShot(impactGroundSound, sfxCue.impactGround);
                createExplosion(projectile.x, surface.y);
                if (surface.source === 'ground') {
                    createCrater(projectile.x, surface.y);
                }
                checkHit(projectile.x, surface.y);
                game.cameraHoldX = Math.max(0, Math.min(WORLD_WIDTH, projectile.x));
                projectile = null;
                switchTurn();
                return;
            }
            
            // Check player collision
            if (isOnlineMultiParticipantCombat()) {
                let hitState = null;
                const attackerUid = online.combat.currentTurnUid;
                for (const uid of (online.combat.turnOrder || [])) {
                    if (uid === attackerUid) {
                        continue;
                    }
                    const state = online.combat.playerStates[uid];
                    if (!state || !state.alive) {
                        continue;
                    }
                    if (Math.hypot(projectile.x - state.x, projectile.y - state.y) < 30) {
                        hitState = state;
                        break;
                    }
                }

                if (hitState) {
                    playOneShot(impactVehicleSound, sfxCue.impactVehicle);
                    const damage = getDamageWithModifiers(online.active ? 28 : (20 + Math.random() * 15));
                    hitState.health = Math.max(0, hitState.health - damage);

                    const hitSeat = online.combat.seatUids[1] === hitState.uid
                        ? 1
                        : (online.combat.seatUids[2] === hitState.uid ? 2 : 0);
                    if (hitSeat) {
                        const checkPlayer = hitSeat === 1 ? player1 : player2;
                        checkPlayer.health = hitState.health;
                        const knockbackDir = Math.sign(checkPlayer.x - projectile.x);
                        checkPlayer.vx = knockbackDir * 3;
                        checkPlayer.vy -= 2;
                        checkPlayer.shake = 15;
                    }

                    game.cameraShake = 12;
                    createExplosion(projectile.x, projectile.y);
                    game.cameraHoldX = Math.max(0, Math.min(WORLD_WIDTH, projectile.x));
                    projectile = null;

                    if (hitState.health <= 0) {
                        hitState.alive = false;
                        hitState.health = 0;
                        triggerDeathFade(hitState);
                        applySeatPlayerStateFromCombatState(hitState);
                        if (getAliveCountBySide(normalizeTeamSide(hitState.side)) === 0) {
                            const winnerSide = oppositeTeamSide(normalizeTeamSide(hitState.side));
                            endGame(winnerSide === 'left' ? 1 : 2);
                        } else {
                            switchTurn();
                        }
                    } else {
                        switchTurn();
                    }
                    return;
                }
            } else {
                const checkPlayer = game.currentPlayer === 1 ? player2 : player1;
                const dx = projectile.x - checkPlayer.x;
                const dy = projectile.y - checkPlayer.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 30) {
                    playOneShot(impactVehicleSound, sfxCue.impactVehicle);
                    const damage = getDamageWithModifiers(online.active ? 28 : (20 + Math.random() * 15));
                    checkPlayer.health = Math.max(0, checkPlayer.health - damage);

                    // Apply knockback effect - push away from projectile
                    const knockbackDir = Math.sign(checkPlayer.x - projectile.x);
                    checkPlayer.vx = knockbackDir * 3; // Horizontal knockback
                    checkPlayer.vy -= 2; // Upward knockback

                    // Trigger character shake
                    checkPlayer.shake = 15;

                    // Trigger camera shake
                    game.cameraShake = 12;

                    createExplosion(projectile.x, projectile.y);
                    game.cameraHoldX = Math.max(0, Math.min(WORLD_WIDTH, projectile.x));
                    projectile = null;

                    if (checkPlayer.health <= 0) {
                        triggerDeathFade(checkPlayer);
                        endGame(game.currentPlayer);
                    } else {
                        switchTurn();
                    }
                    return;
                }
            }
            
            // Check boundaries
            if (projectile.x < 0 || projectile.x > WORLD_WIDTH || projectile.y > WORLD_HEIGHT) {
                game.cameraHoldX = Math.max(0, Math.min(WORLD_WIDTH, projectile.x));
                projectile = null;
                switchTurn();
            }
        }

        let explosionParticles = [];

        function createExplosion(x, y) {
            for (let i = 0; i < 30; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 5 + 2;
                explosionParticles.push({
                    x, y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    size: Math.random() * 5 + 2,
                    color: `hsl(${Math.random() * 60 + 20}, 100%, 60%)`
                });
            }
        }

        function createCrater(x, y) {
            // Modify terrain to create an actual crater/hole
            const craterRadius = 60;
            const craterDepth = 50; // Back to original depth
            
            // Find all terrain points within crater radius and lower them
            for (let i = 0; i < terrain.length; i++) {
                const point = terrain[i];
                const distance = Math.abs(point.x - x);
                
                if (distance < craterRadius) {
                    // Create a smooth crater depression using cosine falloff
                    const falloff = Math.cos((distance / craterRadius) * Math.PI / 2);
                    const depression = craterDepth * falloff;
                    point.y += depression; // Lower the terrain (no limit - can go infinitely deep)
                }
            }
            
            // Smooth the terrain to avoid too many sharp peaks and valleys
            smoothTerrain();
            
            // Don't instantly snap players - they will fall with gravity
            // Just update ground angle for when they land
            player1.groundAngle = getSurfaceBelowY(player1.x, player1.y + 40 - SURFACE_SNAP_GRACE).slope;
            player2.groundAngle = getSurfaceBelowY(player2.x, player2.y + 40 - SURFACE_SNAP_GRACE).slope;
        }

        function createPlatformCrater(x, y) {
            const craterRadius = 44;
            const circleScale = 0.47;
            const punctureRadius = 14;
            const punctureThreshold = 11;

            const nextBodies = [];

            platformBodies.forEach(platform => {
                const xi = Math.round(x);
                const topAt = platform.surfaceTop[xi];
                const bottomAt = platform.surfaceBottom[xi];
                if (topAt === null || bottomAt === null || topAt === undefined || bottomAt === undefined) {
                    nextBodies.push(platform);
                    return;
                }
                const center = (topAt + bottomAt) / 2;
                const targetTop = y <= center;

                const minX = Math.max(0, Math.floor(x - craterRadius));
                const maxX = Math.min(WORLD_WIDTH, Math.ceil(x + craterRadius));
                let touched = false;

                for (let sx = minX; sx <= maxX; sx++) {
                    const topY = platform.surfaceTop[sx];
                    const bottomY = platform.surfaceBottom[sx];
                    if (topY === null || topY === undefined || bottomY === null || bottomY === undefined) {
                        continue;
                    }
                    const dx = sx - x;
                    const inside = craterRadius * craterRadius - dx * dx;
                    if (inside <= 0) {
                        continue;
                    }
                    const arc = Math.sqrt(inside) * circleScale;

                    if (targetTop) {
                        const carvedTop = y + arc;
                        if (carvedTop > topY) {
                            platform.surfaceTop[sx] = carvedTop;
                            touched = true;
                        }
                    } else {
                        const carvedBottom = y - arc;
                        if (carvedBottom < bottomY) {
                            platform.surfaceBottom[sx] = carvedBottom;
                            touched = true;
                        }
                    }
                }

                if (!touched) {
                    nextBodies.push(platform);
                    return;
                }

                let punctured = false;
                const punchMinX = Math.max(0, Math.floor(x - punctureRadius));
                const punchMaxX = Math.min(WORLD_WIDTH, Math.ceil(x + punctureRadius));

                for (let sx = punchMinX; sx <= punchMaxX; sx++) {
                    const topY = platform.surfaceTop[sx];
                    const bottomY = platform.surfaceBottom[sx];
                    if (topY === null || topY === undefined || bottomY === null || bottomY === undefined) {
                        continue;
                    }
                    const dx = Math.abs(sx - x);
                    if (dx > punctureRadius) {
                        continue;
                    }

                    const thickness = bottomY - topY;
                    const localThreshold = punctureThreshold + (1 - dx / punctureRadius) * 6;
                    if (thickness <= localThreshold) {
                        platform.surfaceTop[sx] = null;
                        platform.surfaceBottom[sx] = null;
                        punctured = true;
                    }
                }

                // Keep thickness valid so top never crosses bottom.
                for (let sx = minX; sx <= maxX; sx++) {
                    const topY = platform.surfaceTop[sx];
                    const bottomY = platform.surfaceBottom[sx];
                    if (topY === null || bottomY === null || topY === undefined || bottomY === undefined) {
                        continue;
                    }
                    const minThickness = 6;
                    if (bottomY - topY < minThickness) {
                        if (targetTop) {
                            platform.surfaceTop[sx] = bottomY - minThickness;
                        } else {
                            platform.surfaceBottom[sx] = topY + minThickness;
                        }
                    }
                }

                platform.isDeformed = true;
                if (punctured) {
                    const splitBodies = splitPlatformByDisconnectedSpans(platform);
                    nextBodies.push(...splitBodies);
                } else {
                    rebuildPlatformPointsFromBands(platform);
                    nextBodies.push(platform);
                }
            });

            platformBodies = nextBodies;
        }
        
        function smoothTerrain(passes = 3, strength = 0.45) {
            // Apply smoothing to reduce sharp ups and downs
            const smoothingPasses = passes;
            const smoothingStrength = strength; // How much to blend with neighbors
            
            for (let pass = 0; pass < smoothingPasses; pass++) {
                const newHeights = [];
                
                for (let i = 0; i < terrain.length; i++) {
                    if (i === 0 || i === terrain.length - 1) {
                        // Keep endpoints unchanged
                        newHeights[i] = terrain[i].y;
                    } else {
                        // Blend with neighbors to smooth out sharp transitions
                        const current = terrain[i].y;
                        const prev = terrain[i - 1].y;
                        const next = terrain[i + 1].y;
                        const average = (prev + current + next) / 3;
                        
                        // Mix between current and average based on smoothing strength
                        newHeights[i] = current + (average - current) * smoothingStrength;
                        
                        // No depth limit - terrain can be carved infinitely deep
                    }
                }
                
                // Apply the new heights
                for (let i = 0; i < terrain.length; i++) {
                    terrain[i].y = newHeights[i];
                }
            }
        }
        
        function updatePlayerGravity(player, dt = 1) {
            // Apply horizontal velocity from knockback
            player.x += player.vx * dt;
            
            // Apply friction to horizontal velocity
            player.vx *= Math.pow(0.92, dt); // Friction/drag
            
            // Stop very small velocities
            if (Math.abs(player.vx) < 0.1) {
                player.vx = 0;
            }
            
            // Keep players in bounds
            player.x = Math.max(50, Math.min(WORLD_WIDTH - 50, player.x));
            
            const surface = getSurfaceBelowY(player.x, player.y + 40 - SURFACE_SNAP_GRACE);
            const terrainY = surface.y;
            const playerBottom = player.y + 40; // Player is 40 pixels tall
            
            // Check if player fell into water (die when mostly submerged - 30 pixels into water)
            if (playerBottom >= WATER_LEVEL + 30) {
                if (isOnlineMultiParticipantCombat()) {
                    const seat = player === player1 ? 1 : 2;
                    const uid = online.combat.seatUids[seat];
                    const state = uid ? online.combat.playerStates[uid] : null;
                    if (state) {
                        markParticipantDead(state, true);
                    } else {
                        switchTurn();
                    }
                } else {
                    const winner = player === player1 ? 2 : 1;
                    triggerDeathFade(player);
                    endGame(winner);
                }
                return;
            }
            
            // Only collide with terrain if it's above water level
            // If terrain is underwater, player falls through it
            if (terrainY < WATER_LEVEL) {
                // Terrain is above water - normal collision
                if (playerBottom < terrainY) {
                    player.vy += 0.6 * dt; // Gravity acceleration
                    player.y += player.vy * dt;
                    
                    // Landing
                    if (player.y + 40 >= terrainY) {
                        player.y = terrainY - 40;
                        player.vy = 0;
                        const blended = lerp(player.groundAngle, surface.slope, 0.25);
                        player.groundAngle = clampAngleDelta(player.groundAngle, blended, 3);
                    }
                } else {
                    // On ground
                    player.y = terrainY - 40;
                    player.vy = 0;
                    const blended = lerp(player.groundAngle, surface.slope, 0.25);
                    player.groundAngle = clampAngleDelta(player.groundAngle, blended, 3);
                }
            } else {
                // Terrain is underwater - player falls through
                player.vy += 0.6 * dt; // Gravity acceleration
                player.y += player.vy * dt;
            }
        }

        function updateExplosions(dt = 1) {
            explosionParticles = explosionParticles.filter(p => {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 0.3 * dt;
                p.life -= 0.02 * dt;
                return p.life > 0;
            });
        }

        function checkHit(x, y) {
            if (isOnlineMultiParticipantCombat()) {
                let didHitVehicle = false;
                const states = getDisplayCombatStates();

                states.forEach((state) => {
                    const dist = Math.hypot(x - state.x, y - state.y);
                    if (dist >= 60) {
                        return;
                    }

                    didHitVehicle = true;
                    const damage = getDamageWithModifiers(10);
                    state.health = Math.max(0, state.health - damage);

                    const isSeat1 = online.combat.seatUids[1] === state.uid;
                    const isSeat2 = online.combat.seatUids[2] === state.uid;

                    if (isSeat1 || isSeat2) {
                        const seatPlayer = isSeat1 ? player1 : player2;
                        seatPlayer.health = state.health;
                        const knockbackDir = Math.sign(seatPlayer.x - x);
                        seatPlayer.vx = knockbackDir * 2;
                        seatPlayer.vy -= 1.25;
                        seatPlayer.shake = 12;
                    }

                    game.cameraShake = 10;

                    if (state.health <= 0) {
                        state.alive = false;
                        state.health = 0;
                        triggerDeathFade(state);
                        applySeatPlayerStateFromCombatState(state);
                    }
                });

                if (didHitVehicle) {
                    playOneShot(impactVehicleSound, sfxCue.impactVehicle);
                    const leftAlive = getAliveCountBySide('left');
                    const rightAlive = getAliveCountBySide('right');
                    if (leftAlive === 0 || rightAlive === 0) {
                        endGame(leftAlive > 0 ? 1 : 2);
                    }
                }

                return;
            }

            const dist1 = Math.sqrt((x - player1.x) ** 2 + (y - player1.y) ** 2);
            const dist2 = Math.sqrt((x - player2.x) ** 2 + (y - player2.y) ** 2);
            let didHitVehicle = false;
            
            if (dist1 < 60) {
                didHitVehicle = true;
                const damage = getDamageWithModifiers(10);
                player1.health = Math.max(0, player1.health - damage);
                
                // Apply knockback from explosion
                const knockbackDir1 = Math.sign(player1.x - x);
                player1.vx = knockbackDir1 * 2;
                player1.vy -= 1.25;
                
                // Trigger effects when hit
                player1.shake = 12;
                game.cameraShake = 10;
                
                if (player1.health <= 0) {
                    triggerDeathFade(player1);
                    if (isOnlineMultiParticipantCombat()) {
                        const uid = online.combat.seatUids[1];
                        if (uid && online.combat.playerStates[uid]) {
                            markParticipantDead(online.combat.playerStates[uid], true);
                        }
                        if (getAliveCountBySide('left') === 0) {
                            endGame(2);
                        }
                    } else {
                        endGame(2);
                    }
                }
            }
            if (dist2 < 60) {
                didHitVehicle = true;
                const damage = getDamageWithModifiers(10);
                player2.health = Math.max(0, player2.health - damage);
                
                // Apply knockback from explosion
                const knockbackDir2 = Math.sign(player2.x - x);
                player2.vx = knockbackDir2 * 2;
                player2.vy -= 1.25;
                
                // Trigger effects when hit
                player2.shake = 12;
                game.cameraShake = 10;
                
                if (player2.health <= 0) {
                    triggerDeathFade(player2);
                    if (isOnlineMultiParticipantCombat()) {
                        const uid = online.combat.seatUids[2];
                        if (uid && online.combat.playerStates[uid]) {
                            markParticipantDead(online.combat.playerStates[uid], true);
                        }
                        if (getAliveCountBySide('right') === 0) {
                            endGame(1);
                        }
                    } else {
                        endGame(1);
                    }
                }
            }

            if (didHitVehicle) {
                playOneShot(impactVehicleSound, sfxCue.impactVehicle);
            }
        }

        function switchTurn() {
            // Force-stop charging state so timeout cannot leave charge audio stuck on.
            player1.charging = false;
            player2.charging = false;
            resetAimInput();
            chargeInput.releaseQueued = false;
            chargeInput.owner = null;
            setChargingSoundActive(false);

            // Set delay before actually switching
            game.waitingForTurn = true;
            game.turnDelay = 90; // 1.5 second delay at 60fps
        }
        
        function processTurnSwitch() {
            game.cameraHoldX = null;

            if (isOnlineMultiParticipantCombat()) {
                persistSeatToState(1);
                persistSeatToState(2);

                const leftAlive = getAliveCountBySide('left');
                const rightAlive = getAliveCountBySide('right');
                if (leftAlive === 0 || rightAlive === 0) {
                    endGame(leftAlive > 0 ? 1 : 2);
                    return;
                }

                const turnOrder = online.combat.turnOrder || [];
                const currentUid = online.combat.currentTurnUid;
                const startIndex = Math.max(0, turnOrder.indexOf(currentUid));
                let nextUid = null;
                for (let step = 1; step <= turnOrder.length; step++) {
                    const idx = (startIndex + step) % turnOrder.length;
                    const uid = turnOrder[idx];
                    const state = online.combat.playerStates[uid];
                    if (state && state.alive) {
                        nextUid = uid;
                        break;
                    }
                }

                if (!nextUid) {
                    endGame(game.currentPlayer === 1 ? 2 : 1);
                    return;
                }

                if (!setOnlineCombatSeatPair(nextUid)) {
                    return;
                }
            } else {
                game.currentPlayer = game.currentPlayer === 1 ? 2 : 1;
            }

            const currentPlayerObj = game.currentPlayer === 1 ? player1 : player2;

            // Play cue on actual turn ownership change, not on impact frame.
            playOneShot(switchTurnSound, sfxCue.switchTurn);

            // Refuel at the start of each turn
            currentPlayerObj.fuel = currentPlayerObj.maxFuel;
            game.turnTimeLeft = game.maxTurnTime;
            updateTurnTimer();
            updateTurnIndicator();
            
            // If it's bot's turn (Player 2), start thinking
            if (!online.active && game.currentPlayer === 2) {
                game.botThinking = true;
                game.botMoveTimer = 0;
                botCalculateMove();
            }
            
            game.waitingForTurn = false;
        }

        function updateTurnIndicator() {
            const turnDot = document.getElementById('turnDot');
            if (!turnDot) return;
            const turnName = getCurrentTurnPlayerName();
            if (game.currentPlayer === 1) {
                turnDot.classList.remove('p2');
                turnDot.classList.add('p1');
                turnDot.title = `${turnName}'s turn`;
            } else {
                turnDot.classList.remove('p1');
                turnDot.classList.add('p2');
                turnDot.title = `${turnName}'s turn`;
            }

            if (online.active && isOnlineMultiParticipantCombat() && game.isRunning) {
                setOnlineStatus(`Turn: ${turnName}`);
            }
        }

        function updateTurnTimer() {
            const turnTimer = document.getElementById('turnTimer');
            if (!turnTimer) return;
            turnTimer.textContent = `${game.turnTimeLeft.toFixed(1)}s`;
        }

        function formatClockMs(ms) {
            const totalSec = Math.max(0, Math.floor(ms / 1000));
            const minutes = Math.floor(totalSec / 60);
            const seconds = totalSec % 60;
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function updateMatchClock(ms = game.matchElapsedMs) {
            const clock = document.getElementById('matchClock');
            if (!clock) return;
            clock.textContent = formatClockMs(ms);
        }

        // Bot AI
        function botCalculateMove(context = getBotTurnActors()) {
            if (!context) {
                return;
            }
            const actor = context.actor;
            const target = context.target;

            // Decide on target position (move closer or find better ground)
            const distanceToEnemy = Math.abs(actor.x - target.x);
            
            // Try to get to optimal range (350-550 pixels away)
            if (distanceToEnemy > 600) {
                game.botTargetX = actor.x + (target.x > actor.x ? 120 : -120) + (Math.random() - 0.5) * 60;
            } else if (distanceToEnemy < 300) {
                game.botTargetX = actor.x + (target.x > actor.x ? -90 : 90) + (Math.random() - 0.5) * 70;
            } else {
                game.botTargetX = actor.x + (Math.random() - 0.5) * 70;
            }
            
            // Keep within bounds
            game.botTargetX = Math.max(150, Math.min(WORLD_WIDTH - 150, game.botTargetX));
            
            // Calculate angle and power to hit current target
            const dx = target.x - actor.x;
            const dy = target.y - actor.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            setPlayerFacingWithoutMirroring(actor, dx >= 0 ? 1 : -1);

            // Wind compensation (rough)
            const effectiveWind = getEffectiveWind();
            const baseWorldAngle = Math.atan2(-dy, dx) * 180 / Math.PI;
            const baseLocalAngle = clampPlayerLocalAngle(actor, baseWorldAngle - actor.groundAngle + effectiveWind * 0.08);
            const basePower = Math.max(40, Math.min(100, (distance / 7) + 28 + Math.abs(effectiveWind) * 0.2));

            let bestAngle = baseLocalAngle;
            let bestPower = basePower;
            let bestScore = Infinity;
            const angleOffsets = [-18, -12, -6, 0, 6, 12, 18];
            const powerOffsets = [-15, -10, -5, 0, 5, 10, 15];

            for (const angleOffset of angleOffsets) {
                const candidateAngle = clampPlayerLocalAngle(actor, baseLocalAngle + angleOffset);
                for (const powerOffset of powerOffsets) {
                    const candidatePower = Math.max(40, Math.min(100, basePower + powerOffset));
                    const score = simulateBotShotError(actor, target, candidateAngle, candidatePower, effectiveWind);
                    if (score < bestScore) {
                        bestScore = score;
                        bestAngle = candidateAngle;
                        bestPower = candidatePower;
                    }
                }
            }

            game.botCalculatedAngle = bestAngle;
            game.botCalculatedPower = bestPower;
        }

        function updateBot(dt = 1) {
            const context = getBotTurnActors();
            if (!game.botThinking || !context) return;

            const actor = context.actor;
            const target = context.target;
            
            game.botMoveTimer++;
            
            // Phase 1: Move to target position (first 60 frames)
            if (game.botMoveTimer < 60 && actor.fuel > 0) {
                const diff = game.botTargetX - actor.x;
                if (Math.abs(diff) > 5) {
                    const moveDirection = diff > 0 ? 1 : -1;
                    setPlayerFacingWithoutMirroring(actor, moveDirection);
                    const newX = actor.x + moveDirection * 3;
                    
                    // Check bounds and distance to current target
                    if (newX > 50 && newX < WORLD_WIDTH - 50 && Math.abs(newX - target.x) > 100) {
                        actor.x = newX;
                        // Don't snap Y, let gravity handle it
                        actor.fuel = Math.max(0, actor.fuel - 2);
                    } else {
                        game.botMoveTimer = 60; // Skip to next phase if can't move
                    }
                }
            }
            
            // Phase 2: Adjust angle (frames 60-90)
            if (game.botMoveTimer >= 60 && game.botMoveTimer < 90) {
                if (game.botMoveTimer === 60) {
                    botCalculateMove(context);
                }
                setPlayerFacingWithoutMirroring(actor, target.x >= actor.x ? 1 : -1);
                const angleDiff = game.botCalculatedAngle - actor.angle;
                if (Math.abs(angleDiff) > 2) {
                    actor.angle += angleDiff > 0 ? 2 : -2;
                    actor.angle = clampPlayerLocalAngle(actor, actor.angle);
                }
            }
            
            // Phase 3: Charge and fire (frames 90+)
            if (game.botMoveTimer >= 90) {
                if (!actor.charging) {
                    actor.charging = true;
                    actor.power = 0;
                }
                
                if (actor.power < game.botCalculatedPower) {
                    actor.power = Math.min(game.botCalculatedPower, actor.power + CHARGE_RATE_PER_TICK * dt);
                } else {
                    // Fire!
                    fire(actor);
                    actor.charging = false;
                    game.botThinking = false;
                }
            }
        }

        function endGame(winner) {
            if (game.endSlowMo) return;
            resetAimInput();
            chargeInput.releaseQueued = false;
            chargeInput.owner = null;
            playOneShot(matchEndSound, sfxCue.matchEnd);
            game.winner = winner;
            game.endSlowMo = true;
            game.endTimer = 90; // ~1.5s at 60fps
            game.timeScale = 0.35;
            game.waitingForTurn = true;
            
            // Stop BGM immediately on game end
            bgmSound.pause();
            bgmSound.currentTime = 0;
            killingTimeBgmSound.pause();
            killingTimeBgmSound.currentTime = 0;
            mapScanBgmSound.pause();
            mapScanBgmSound.currentTime = 0;
            gameplayBgmMode = 'off';
        }

        function getWinnerTeamText() {
            return game.winner === 1 ? 'BLUE TEAM WINS!' : 'RED TEAM WINS!';
        }

        function getDamageWithModifiers(baseDamage) {
            if (killingTime.activeEffects.doubleDamage) {
                return baseDamage * 2;
            }
            return baseDamage;
        }

        function showKillingTimeAnnouncement(text, durationMs = 2300) {
            killingTime.popupText = text;
            killingTime.popupUntilMs = Date.now() + durationMs;
        }

        function activateKillingTimeNow(nowMs = Date.now()) {
            if (killingTime.active) {
                return;
            }
            killingTime.active = true;
            killingTime.startedAtMs = nowMs;
            killingTime.nextEffectAtMs = nowMs + 1300;
            setGameplayBgmMode('killing-time');
            showKillingTimeAnnouncement('KILLING TIME', 2600);
        }

        function resetKillingTime() {
            killingTime.active = false;
            killingTime.startedAtMs = 0;
            killingTime.nextEffectAtMs = 0;
            killingTime.availableEffects = ['doubleDamage', 'meteors', 'risingWater', 'rapidTurns'];
            killingTime.activeEffects.doubleDamage = false;
            killingTime.activeEffects.meteors = false;
            killingTime.activeEffects.risingWater = false;
            killingTime.activeEffects.rapidTurns = false;
            killingTime.meteorSpawnAtMs = 0;
            killingTime.meteors = [];
            killingTime.waterRisePx = 0;
            killingTime.popupText = '';
            killingTime.popupUntilMs = 0;
            WATER_LEVEL = BASE_WATER_LEVEL;
            if (game.isRunning && !game.endSlowMo) {
                setGameplayBgmMode('normal');
            }
        }

        function activateRandomKillingTimeEffect(nowMs) {
            if (killingTime.availableEffects.length === 0) {
                return;
            }

            const pickIndex = Math.floor(Math.random() * killingTime.availableEffects.length);
            const effectKey = killingTime.availableEffects.splice(pickIndex, 1)[0];
            killingTime.activeEffects[effectKey] = true;

            if (effectKey === 'doubleDamage') {
                showKillingTimeAnnouncement('DOUBLE DAMAGE', 2200);
            } else if (effectKey === 'meteors') {
                killingTime.meteorSpawnAtMs = nowMs + 1200;
                showKillingTimeAnnouncement('METEOR SHOWER', 2200);
            } else if (effectKey === 'risingWater') {
                showKillingTimeAnnouncement('RISING WATER', 2200);
            } else if (effectKey === 'rapidTurns') {
                game.maxTurnTime = 8;
                game.turnTimeLeft = Math.min(game.turnTimeLeft, game.maxTurnTime);
                showKillingTimeAnnouncement('RAPID TURNS', 2200);
            }
        }

        function spawnMeteor() {
            const radius = 10 + Math.random() * 7;
            const x = 40 + Math.random() * (WORLD_WIDTH - 80);
            const speed = 5.2 + Math.random() * 2.6;
            killingTime.meteors.push({
                x,
                y: -70,
                vx: (Math.random() - 0.5) * 1.1,
                vy: speed,
                radius,
                damage: 14 + Math.random() * 10,
                glow: 1 + Math.random() * 0.6
            });
        }

        function updateMeteors(dt = 1) {
            if (!killingTime.activeEffects.meteors) {
                return;
            }

            for (let i = killingTime.meteors.length - 1; i >= 0; i--) {
                const meteor = killingTime.meteors[i];
                const previousY = meteor.y;
                meteor.vy += 0.06 * dt;
                meteor.x += meteor.vx * dt;
                meteor.y += meteor.vy * dt;

                const hitP1 = Math.hypot(meteor.x - player1.x, meteor.y - (player1.y - 8)) <= meteor.radius + 18;
                const hitP2 = Math.hypot(meteor.x - player2.x, meteor.y - (player2.y - 8)) <= meteor.radius + 18;

                if (hitP1 || hitP2) {
                    const target = hitP1 ? player1 : player2;
                    const winnerIfDead = target === player1 ? 2 : 1;
                    const damage = getDamageWithModifiers(meteor.damage);
                    target.health = Math.max(0, target.health - damage);
                    target.vx += Math.sign(target.x - meteor.x || 1) * 3.2;
                    target.vy -= 2.4;
                    target.shake = 16;
                    game.cameraShake = 14;
                    createExplosion(meteor.x, meteor.y);
                    playOneShot(impactVehicleSound, sfxCue.impactVehicle);
                    killingTime.meteors.splice(i, 1);
                    if (target.health <= 0) {
                        endGame(winnerIfDead);
                    }
                    continue;
                }

                // Use top-most surface so flying islands are treated as ground for meteors.
                const surface = getSurfaceBelowY(meteor.x, -100000);
                const hitSurface = previousY <= surface.y && meteor.y >= surface.y;
                const hitWater = meteor.y >= WATER_LEVEL;

                if (hitSurface || hitWater) {
                    const impactY = hitSurface ? surface.y : WATER_LEVEL;
                    createExplosion(meteor.x, impactY);
                    if (hitSurface && surface.source === 'ground') {
                        createCrater(meteor.x, impactY);
                    }
                    if (hitSurface && surface.source === 'platform') {
                        createPlatformCrater(meteor.x, impactY);
                    }
                    checkHit(meteor.x, impactY);
                    playOneShot(impactGroundSound, sfxCue.impactGround);
                    killingTime.meteors.splice(i, 1);
                    continue;
                }

                if (meteor.y > WORLD_HEIGHT + 140 || meteor.x < -120 || meteor.x > WORLD_WIDTH + 120) {
                    killingTime.meteors.splice(i, 1);
                }
            }
        }

        function updateKillingTime(dt = 1) {
            if (!game.isRunning || game.endSlowMo) {
                return;
            }

            const nowMs = Date.now();
            game.matchElapsedMs = Math.max(0, nowMs - game.matchStartedAtMs);

            if (!killingTime.active && game.matchElapsedMs >= killingTime.triggerAtMs) {
                activateKillingTimeNow(nowMs);
            }

            if (killingTime.active && nowMs >= killingTime.nextEffectAtMs) {
                activateRandomKillingTimeEffect(nowMs);
                killingTime.nextEffectAtMs = nowMs + killingTime.effectIntervalMs;
            }

            if (killingTime.activeEffects.risingWater) {
                const seconds = dt / 60;
                killingTime.waterRisePx += killingTime.waterRiseRatePerSec * seconds;
                WATER_LEVEL = Math.max(100, BASE_WATER_LEVEL - killingTime.waterRisePx);
            } else {
                WATER_LEVEL = BASE_WATER_LEVEL;
            }

            if (killingTime.activeEffects.meteors) {
                if (nowMs >= killingTime.meteorSpawnAtMs) {
                    spawnMeteor();
                    killingTime.meteorSpawnAtMs = nowMs + 1800 + Math.random() * 2400;
                }
                updateMeteors(dt);
            } else {
                killingTime.meteors.length = 0;
            }
        }

        function update() {
            if (game.prematchScan.active) {
                const maxCameraX = WORLD_WIDTH - VIEW_WIDTH;
                const now = performance.now();

                if (game.prematchScan.phase === 'sweep') {
                    const elapsed = now - game.prematchScan.startedAt;
                    const progress = Math.max(0, Math.min(1, elapsed / game.prematchScan.durationMs));
                    const sweepFromX = Number.isFinite(game.prematchScan.sweepFromX) ? game.prematchScan.sweepFromX : 0;
                    const sweepToX = Number.isFinite(game.prematchScan.sweepToX) ? game.prematchScan.sweepToX : maxCameraX;
                    camera.x = lerp(sweepFromX, sweepToX, progress);

                    if (progress >= 1) {
                        const focusPlayerObj = game.prematchScan.focusPlayer === 2 ? player2 : player1;
                        const desired = Math.max(0, Math.min(maxCameraX, focusPlayerObj.x - VIEW_WIDTH / 2));
                        game.prematchScan.phase = 'return';
                        game.prematchScan.returnStartedAt = now;
                        game.prematchScan.returnFromX = sweepToX;
                        game.prematchScan.returnTargetX = desired;
                        game.prematchScan.returnDurationMs = 1800;
                    }
                } else {
                    const elapsedReturn = now - game.prematchScan.returnStartedAt;
                    const returnProgress = Math.max(0, Math.min(1, elapsedReturn / game.prematchScan.returnDurationMs));
                    const returnFromX = Number.isFinite(game.prematchScan.returnFromX)
                        ? game.prematchScan.returnFromX
                        : maxCameraX;
                    camera.x = lerp(returnFromX, game.prematchScan.returnTargetX, returnProgress);

                    if (returnProgress >= 1) {
                        camera.x = game.prematchScan.returnTargetX;
                        startGameCore(game.prematchScan.isOnlineStart, game.prematchScan.killingTimeStart);
                    }
                }

                setEngineSoundMoving(false);
                setChargingSoundActive(false);
                tryPlayMapScanBgm();
                return;
            }

            if (!game.isRunning) {
                setEngineSoundMoving(false);
                setChargingSoundActive(false);
                updateConnectionIndicator();
                updateMatchClock(0);
                return;
            }

            const dt = game.timeScale;

            updateMatchClock();

            updateKillingTime(dt);

            if (!online.active) {
                updateWind(dt);
            } else {
                wind.strength = 0;
                wind.target = 0;
                updateWindIndicator();
            }

            if (game.endSlowMo) {
                game.endTimer--;
                if (game.endTimer <= 0) {
                    game.isRunning = false;
                    game.timeScale = 1;
                    setEngineSoundMoving(false);
                    setChargingSoundActive(false);
                    document.getElementById('winnerText').textContent = getWinnerTeamText();
                    document.getElementById('gameOverScreen').style.display = 'flex';
                    return;
                }
            }
            
            // Handle turn delay countdown (physics continues, just delay turn switch)
            if (game.waitingForTurn && !game.endSlowMo) {
                game.turnDelay--;
                if (game.turnDelay <= 0) {
                    processTurnSwitch();
                }
                // Continue with physics updates below, just skip input
            }

            // Turn timer countdown (only when player can act)
            if (!game.waitingForTurn && !game.endSlowMo && !projectile) {
                game.turnTimeLeft = Math.max(0, game.turnTimeLeft - (1 / 60) * dt);
                updateTurnTimer();
                if (game.turnTimeLeft <= 0) {
                    const timeoutPlayer = game.currentPlayer === 1 ? player1 : player2;
                    if (timeoutPlayer.charging && timeoutPlayer.power > 0) {
                        fire(timeoutPlayer);
                        timeoutPlayer.charging = false;
                    } else {
                        switchTurn();
                    }
                }
            }
            
            const currentPlayerObj = game.currentPlayer === 1 ? player1 : player2;
            const otherPlayerObj = game.currentPlayer === 1 ? player2 : player1;

            beginBotTurnIfNeeded();

            const cameraTargetX = projectile
                ? projectile.x
                : (game.cameraHoldX !== null ? game.cameraHoldX : currentPlayerObj.x);
            updateCamera(cameraTargetX);
            
            // Bot AI update (skip if waiting for turn)
            if (!game.waitingForTurn && !game.endSlowMo) {
                updateBot(dt);
            }
            
            // Movement controls for active local player.
            const canControlCurrentTurn = !online.active
                ? game.currentPlayer === 1
                : isLocalTurnOwner();

            if (canControlCurrentTurn && !projectile && !currentPlayerObj.charging && currentPlayerObj.fuel > 0 && !game.waitingForTurn && !game.endSlowMo) {
                    const moveSpeed = 1.2; // Reduced movement speed
                
                if (keys['ArrowLeft']) {
                    setPlayerFacing(currentPlayerObj, -1);
                    const newX = currentPlayerObj.x - moveSpeed;
                    // Don't go off screen or too close to other player
                    if (newX > 50 && Math.abs(newX - otherPlayerObj.x) > 100) {
                        currentPlayerObj.x = newX;
                        // Don't snap Y, let gravity handle it
                            const newSurface = getSurfaceBelowY(newX, currentPlayerObj.y + 40 - SURFACE_SNAP_GRACE);
                        currentPlayerObj.groundAngle = getSurfaceBelowY(currentPlayerObj.x, currentPlayerObj.y + 40 - SURFACE_SNAP_GRACE).slope;
                            // More fuel cost going uphill (positive slope when moving left), less downhill
                            const fuelCost = newSurface.slope > 0 ? 3 : 1.5;
                        currentPlayerObj.fuel = Math.max(0, currentPlayerObj.fuel - fuelCost);
                    }
                }
                if (keys['ArrowRight']) {
                    setPlayerFacing(currentPlayerObj, 1);
                    const newX = currentPlayerObj.x + moveSpeed;
                    // Don't go off screen or too close to other player
                    if (newX < WORLD_WIDTH - 50 && Math.abs(newX - otherPlayerObj.x) > 100) {
                        currentPlayerObj.x = newX;
                        // Don't snap Y, let gravity handle it
                            const newSurface = getSurfaceBelowY(newX, currentPlayerObj.y + 40 - SURFACE_SNAP_GRACE);
                        currentPlayerObj.groundAngle = getSurfaceBelowY(currentPlayerObj.x, currentPlayerObj.y + 40 - SURFACE_SNAP_GRACE).slope;
                            // More fuel cost going uphill (negative slope when moving right), less downhill
                            const fuelCost = newSurface.slope < 0 ? 3 : 1.5;
                        currentPlayerObj.fuel = Math.max(0, currentPlayerObj.fuel - fuelCost);
                    }
                }
            }
            
            // Angle control: single tap = 1 degree, hold = repeated 1-degree steps.
            updateAimInput(currentPlayerObj, canControlCurrentTurn);

            if (canControlCurrentTurn
                && chargeInput.releaseQueued
                && chargeInput.owner === game.currentPlayer
                && currentPlayerObj.charging
                && !projectile
                && !game.waitingForTurn
                && !game.endSlowMo) {
                if (currentPlayerObj.power > 0) {
                    fire(currentPlayerObj);
                }
                currentPlayerObj.charging = false;
                setChargingSoundActive(false);
                chargeInput.releaseQueued = false;
                chargeInput.owner = null;
            }
            
            // Power charging for active local player.
            if (canControlCurrentTurn && currentPlayerObj.charging && !projectile && !game.waitingForTurn && !game.endSlowMo) {
                currentPlayerObj.power = Math.min(100, currentPlayerObj.power + CHARGE_RATE_PER_TICK * dt);
                if (currentPlayerObj.power >= 100) {
                    currentPlayerObj.power = 100;
                    currentPlayerObj.charging = false;
                    setChargingSoundActive(false);
                    fire(currentPlayerObj);
                }
            }
            
            // Apply gravity to all live combat participants in online matches.
            if (isOnlineMultiParticipantCombat()) {
                persistSeatToState(1);
                persistSeatToState(2);
                (online.combat.turnOrder || []).forEach((uid) => {
                    const state = online.combat.playerStates[uid];
                    updateParticipantGravity(state, dt);
                });
            } else {
                // Apply gravity to both players so they fall into craters
                updatePlayerGravity(player1, dt);
                updatePlayerGravity(player2, dt);
            }

            if (online.active && canControlCurrentTurn && !projectile && !game.waitingForTurn && !game.endSlowMo) {
                sendOnlineLiveState(currentPlayerObj);
            }
            
            // Update shake effects
            updateShake();
            
            updateProjectile(dt);
            updateExplosions(dt);
            updateEngineSound();
            updateChargingSound();
            updateBGM();
            updateConnectionIndicator();
        }
        
        function updateShake() {
            // Update camera shake
            if (game.cameraShake > 0) {
                game.cameraShake--;
                game.cameraShakeX = (Math.random() - 0.5) * 8;
                game.cameraShakeY = (Math.random() - 0.5) * 8;
            } else {
                game.cameraShakeX = 0;
                game.cameraShakeY = 0;
            }
            
            // Update player character shake
            if (player1.shake > 0) {
                player1.shake--;
                player1.shakeX = (Math.random() - 0.5) * 4;
                player1.shakeY = (Math.random() - 0.5) * 4;
            } else {
                player1.shakeX = 0;
                player1.shakeY = 0;
            }
            
            if (player2.shake > 0) {
                player2.shake--;
                player2.shakeX = (Math.random() - 0.5) * 4;
                player2.shakeY = (Math.random() - 0.5) * 4;
            } else {
                player2.shakeX = 0;
                player2.shakeY = 0;
            }

            if (isOnlineMultiParticipantCombat()) {
                (online.combat.turnOrder || []).forEach((uid) => {
                    const state = online.combat.playerStates[uid];
                    if (!state || !state.alive) {
                        return;
                    }
                    if (state.shake > 0) {
                        state.shake--;
                        state.shakeX = (Math.random() - 0.5) * 4;
                        state.shakeY = (Math.random() - 0.5) * 4;
                    } else {
                        state.shakeX = 0;
                        state.shakeY = 0;
                    }
                    applySeatPlayerStateFromCombatState(state);
                });
            }
        }

        function drawTerrain() {
            ctx.fillStyle = groundStyle.fill;
            ctx.beginPath();
            ctx.moveTo(0, WORLD_HEIGHT);
            for (let point of terrain) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = groundStyle.stroke;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, terrain[0].y);
            for (let point of terrain) {
                ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();

            platformBodies.forEach(platform => {
                ctx.fillStyle = platform.fill;
                ctx.strokeStyle = platform.stroke;
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                if (!platform.isDeformed && platform.originalPath2d) {
                    ctx.save();
                    ctx.translate(mapOffsetX, mapOffsetY);
                    ctx.scale(terrainScaleX, terrainScaleY);
                    ctx.fill(platform.originalPath2d);
                    ctx.stroke(platform.originalPath2d);
                    ctx.restore();
                } else {
                    ctx.fill(platform.path2d);
                    ctx.stroke(platform.path2d);
                }
            });
        }

        function drawWater() {
            // Water body
            const waterFill = ACTIVE_MAP_MODE === 'tile' ? '#6B9EA2' : MAP01.water.fill;
            const waterStroke = ACTIVE_MAP_MODE === 'tile' ? '#5AC4BF' : MAP01.water.stroke;
            ctx.fillStyle = waterFill;
            ctx.fillRect(0, WATER_LEVEL, WORLD_WIDTH, WORLD_HEIGHT - WATER_LEVEL);

            // Wave animation
            ctx.strokeStyle = waterStroke;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let x = 0; x <= WORLD_WIDTH; x += 15) {
                const waveOffset = Math.sin(x * 0.02 + Date.now() * 0.003) * 3;
                if (x === 0) ctx.moveTo(x, WATER_LEVEL + waveOffset);
                else ctx.lineTo(x, WATER_LEVEL + waveOffset);
            }
            ctx.stroke();

            // Water surface line
            ctx.strokeStyle = waterStroke;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, WATER_LEVEL);
            ctx.lineTo(WORLD_WIDTH, WATER_LEVEL);
            ctx.stroke();
        }

        function drawPlayer(player, isActive) {
            const fadeAlpha = getDeathFadeAlpha(player);
            if (fadeAlpha <= 0) {
                return;
            }

            ctx.save();
            ctx.globalAlpha *= fadeAlpha;
            // Apply character shake
            ctx.translate(player.x + player.shakeX, player.y + player.shakeY);
            // Rotate based on ground slope (negate to get correct tilt direction)
            ctx.rotate(-player.groundAngle * Math.PI / 180);
            
            // Vehicle body
            ctx.fillStyle = player.vehicleColor;
            ctx.beginPath();
            ctx.roundRect(-25, -10, 50, 25, 5);
            ctx.fill();
            
            // Wheels
            ctx.fillStyle = '#333';
            ctx.beginPath();
            ctx.arc(-15, 20, 8, 0, Math.PI * 2);
            ctx.arc(15, 20, 8, 0, Math.PI * 2);
            ctx.fill();
            
            // Character (cute blob)
            ctx.fillStyle = player.color;
            ctx.beginPath();
            ctx.ellipse(0, -25, 12, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(-5, -27, 3, 0, Math.PI * 2);
            ctx.arc(5, -27, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(-5, -27, 1.5, 0, Math.PI * 2);
            ctx.arc(5, -27, 1.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Gun barrel
            if (isActive && !projectile) {
                const limits = getPlayerLocalAngleLimits(player);
                const guideBaseX = 0;
                const guideBaseY = -15;
                const guideRadius = 52;

                // Soft local min/max guide fan.
                ctx.fillStyle = 'rgba(180, 220, 255, 0.07)';
                ctx.strokeStyle = 'rgba(180, 220, 255, 0.14)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(guideBaseX, guideBaseY);
                for (let a = limits.min; a <= limits.max; a += 2) {
                    const rad = (a * Math.PI) / 180;
                    ctx.lineTo(
                        guideBaseX + Math.cos(rad) * guideRadius,
                        guideBaseY - Math.sin(rad) * guideRadius
                    );
                }
                const maxRad = (limits.max * Math.PI) / 180;
                ctx.lineTo(
                    guideBaseX + Math.cos(maxRad) * guideRadius,
                    guideBaseY - Math.sin(maxRad) * guideRadius
                );
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.strokeStyle = 'rgba(180, 220, 255, 0.12)';
                ctx.lineWidth = 1.2;
                const minRad = (limits.min * Math.PI) / 180;
                ctx.beginPath();
                ctx.moveTo(guideBaseX, guideBaseY);
                ctx.lineTo(
                    guideBaseX + Math.cos(minRad) * guideRadius,
                    guideBaseY - Math.sin(minRad) * guideRadius
                );
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(guideBaseX, guideBaseY);
                ctx.lineTo(
                    guideBaseX + Math.cos(maxRad) * guideRadius,
                    guideBaseY - Math.sin(maxRad) * guideRadius
                );
                ctx.stroke();

                // In rotated canvas, just use player.angle directly
                const barrelAngleRad = (player.angle * Math.PI) / 180;
                const barrelLength = 35;
                ctx.strokeStyle = player.vehicleColor;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(Math.cos(barrelAngleRad) * barrelLength, -Math.sin(barrelAngleRad) * barrelLength - 15);
                ctx.stroke();
                
                // Angle indicator uses the same local scale for both players.
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '12px Poppins';
                const displayAngle = getPlayerDisplayAngle(player);
                ctx.fillText(`${Math.round(displayAngle)}\u00B0`, -15, -45);
            }
            
            ctx.restore();
        }

        function drawPlayerHud(player) {
            // Health/Fuel bars (top corners)
            const barWidth = 120;
            const barHeight = 12;
            const barY = 14;
            const iconSize = 14;
            const iconGap = 8;
            const panelPad = 14;
            const barX = player === player1
                ? panelPad + iconSize + iconGap
                : canvas.width - panelPad - iconSize - iconGap - barWidth;
            const iconX = player === player1 ? panelPad : barX - iconGap - iconSize;

            // Health icon (heart)
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            const hx = iconX + iconSize / 2;
            const hy = barY + iconSize / 2 - 1;
            ctx.moveTo(hx, hy + 4);
            ctx.bezierCurveTo(hx - 6, hy - 2, hx - 8, hy + 6, hx, hy + 9);
            ctx.bezierCurveTo(hx + 8, hy + 6, hx + 6, hy - 2, hx, hy + 4);
            ctx.fill();

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            const healthWidth = (player.health / player.maxHealth) * barWidth;
            ctx.fillStyle = player.health > 50 ? '#2ecc71' : player.health > 25 ? '#f7b731' : '#ff6b6b';
            ctx.fillRect(barX, barY, healthWidth, barHeight);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Fuel icon (gas pump)
            const fuelBarY = barY + 20;
            ctx.fillStyle = '#f7b731';
            ctx.fillRect(iconX + 2, fuelBarY, iconSize - 4, iconSize);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fillRect(iconX + 4, fuelBarY + 2, iconSize - 8, 4);
            ctx.strokeStyle = 'rgba(20, 20, 30, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(iconX + iconSize - 2, fuelBarY + 3);
            ctx.lineTo(iconX + iconSize + 6, fuelBarY + 3);
            ctx.lineTo(iconX + iconSize + 6, fuelBarY + 10);
            ctx.stroke();

            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillRect(barX, fuelBarY, barWidth, barHeight);

            const fuelWidth = (player.fuel / player.maxFuel) * barWidth;
            ctx.fillStyle = player.fuel > 50 ? '#f7b731' : player.fuel > 25 ? '#ff9f43' : '#ee5a6f';
            ctx.fillRect(barX, fuelBarY, fuelWidth, barHeight);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, fuelBarY, barWidth, barHeight);
        }

        function drawPowerBar(player) {
            if (!player.charging || projectile) return;

            const barWidth = Math.min(560, Math.max(320, Math.floor(canvas.width * 0.5)));
            const barHeight = 30;
            const barX = Math.floor((canvas.width - barWidth) / 2);
            const barY = canvas.height - 44;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth, barHeight);
            
            const powerWidth = (player.power / 100) * barWidth;
            const chargeRatio = Math.max(0, Math.min(1, player.power / 100));
            const hueA = 200 - Math.round(chargeRatio * 180);
            const hueB = Math.max(0, hueA - 24);
            const gradient = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
            gradient.addColorStop(0, `hsl(${hueA}, 90%, 58%)`);
            gradient.addColorStop(1, `hsl(${hueB}, 92%, 52%)`);
            ctx.fillStyle = gradient;
            ctx.fillRect(barX, barY, powerWidth, barHeight);
            
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Poppins';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(player.power)}%`, barX + barWidth / 2, barY + 21);
        }

        function drawProjectile() {
            if (!projectile) return;
            
            // Trail
            ctx.strokeStyle = 'rgba(255, 200, 100, 0.5)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            for (let i = 0; i < projectile.trail.length; i++) {
                const point = projectile.trail[i];
                if (i === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            }
            ctx.stroke();
            
            // Projectile
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#ff9900';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        function drawMeteors() {
            if (!killingTime.meteors.length) {
                return;
            }

            killingTime.meteors.forEach((meteor) => {
                const glowRadius = meteor.radius * (1.6 + meteor.glow * 0.35);
                const gradient = ctx.createRadialGradient(
                    meteor.x,
                    meteor.y,
                    2,
                    meteor.x,
                    meteor.y,
                    glowRadius
                );
                gradient.addColorStop(0, 'rgba(255, 250, 210, 0.95)');
                gradient.addColorStop(0.55, 'rgba(255, 158, 90, 0.8)');
                gradient.addColorStop(1, 'rgba(255, 90, 40, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(meteor.x, meteor.y, glowRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffb347';
                ctx.beginPath();
                ctx.arc(meteor.x, meteor.y, meteor.radius, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255, 230, 170, 0.7)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }

        function drawKillingTimeAnnouncement() {
            if (!killingTime.popupText) {
                return;
            }

            const nowMs = Date.now();
            if (nowMs >= killingTime.popupUntilMs) {
                killingTime.popupText = '';
                return;
            }

            const remaining = killingTime.popupUntilMs - nowMs;
            const alpha = Math.max(0, Math.min(1, remaining / 500));
            const pulse = 0.95 + 0.05 * Math.sin(nowMs * 0.01);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';
            ctx.font = '700 56px Poppins';
            ctx.fillStyle = 'rgba(255, 76, 76, 0.94)';
            ctx.shadowColor = 'rgba(255, 76, 76, 0.8)';
            ctx.shadowBlur = 18;
            ctx.fillText(killingTime.popupText, canvas.width / 2, 170 * pulse);
            ctx.restore();
        }

        function drawExplosions() {
            explosionParticles.forEach(p => {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        function draw() {
            // Sky gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(1, '#2d3561');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Apply camera and shake to world rendering
            ctx.save();
            ctx.translate(-camera.x + game.cameraShakeX, game.cameraShakeY);

            drawTerrain();

            const currentPlayerObj = game.currentPlayer === 1 ? player1 : player2;

            if (isOnlineMultiParticipantCombat()) {
                const seatState1 = getStateBySeat(1);
                const seatState2 = getStateBySeat(2);
                const seatUid1 = online.combat.seatUids[1];
                const seatUid2 = online.combat.seatUids[2];

                getDisplayCombatStates().forEach((state) => {
                    if (state.uid === seatUid1 || state.uid === seatUid2) {
                        return;
                    }
                    const renderPlayer = buildRenderPlayerFromCombatState(state);
                    drawPlayer(renderPlayer, false);
                });

                if (seatState1 && (seatState1.alive || getDeathFadeAlpha(player1) > 0)) {
                    drawPlayer(player1, game.currentPlayer === 1);
                }
                if (seatState2 && (seatState2.alive || getDeathFadeAlpha(player2) > 0)) {
                    drawPlayer(player2, game.currentPlayer === 2);
                }
            } else {
                drawPlayer(player1, game.currentPlayer === 1);
                drawPlayer(player2, game.currentPlayer === 2);
            }

            drawProjectile();
            drawMeteors();
            drawExplosions();

            // Draw water on top so it covers submerged players
            drawWater();

            // Player labels
            ctx.font = 'bold 14px Poppins';
            ctx.textAlign = 'center';

            if (isOnlineMultiParticipantCombat()) {
                const seatUid1 = online.combat.seatUids[1];
                const seatUid2 = online.combat.seatUids[2];
                const seatState1 = getStateBySeat(1);
                const seatState2 = getStateBySeat(2);

                getDisplayCombatStates().forEach((state) => {
                    if (state.uid === seatUid1 || state.uid === seatUid2) {
                        return;
                    }
                    const visuals = getSlotVisuals(state.slot);
                    ctx.fillStyle = visuals.color;
                    const displayName = getShortDisplayName(state.name || getSlotLabel(state.slot));
                    ctx.fillText(displayName, state.x, state.y - 58);

                    const hpRatio = Math.max(0, Math.min(1, Number(state.health || 0) / Math.max(1, Number(state.maxHealth || 100))));
                    const miniBarW = 46;
                    const miniBarH = 6;
                    const miniBarX = state.x - miniBarW / 2;
                    const miniBarY = state.y + 56;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    ctx.fillRect(miniBarX, miniBarY, miniBarW, miniBarH);
                    ctx.fillStyle = hpRatio > 0.5 ? '#2ecc71' : hpRatio > 0.25 ? '#f7b731' : '#ff6b6b';
                    ctx.fillRect(miniBarX, miniBarY, miniBarW * hpRatio, miniBarH);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(miniBarX, miniBarY, miniBarW, miniBarH);
                    ctx.font = 'bold 14px Poppins';
                });

                if (seatState1 && (seatState1.alive || getDeathFadeAlpha(player1) > 0)) {
                    ctx.fillStyle = player1.color;
                    const seat1Name = getShortDisplayName(seatState1.name || getSlotLabel(seatState1.slot));
                    ctx.fillText(seat1Name, player1.x, player1.y - 58);
                    const seat1HpRatio = Math.max(0, Math.min(1, Number(seatState1.health || 0) / Math.max(1, Number(seatState1.maxHealth || 100))));
                    const seat1BarW = 46;
                    const seat1BarH = 6;
                    const seat1BarX = player1.x - seat1BarW / 2;
                    const seat1BarY = player1.y + 56;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    ctx.fillRect(seat1BarX, seat1BarY, seat1BarW, seat1BarH);
                    ctx.fillStyle = seat1HpRatio > 0.5 ? '#2ecc71' : seat1HpRatio > 0.25 ? '#f7b731' : '#ff6b6b';
                    ctx.fillRect(seat1BarX, seat1BarY, seat1BarW * seat1HpRatio, seat1BarH);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(seat1BarX, seat1BarY, seat1BarW, seat1BarH);
                    ctx.font = 'bold 14px Poppins';
                }
                if (seatState2 && (seatState2.alive || getDeathFadeAlpha(player2) > 0)) {
                    ctx.fillStyle = player2.color;
                    const seat2Name = getShortDisplayName(seatState2.name || getSlotLabel(seatState2.slot));
                    ctx.fillText(seat2Name, player2.x, player2.y - 58);
                    const seat2HpRatio = Math.max(0, Math.min(1, Number(seatState2.health || 0) / Math.max(1, Number(seatState2.maxHealth || 100))));
                    const seat2BarW = 46;
                    const seat2BarH = 6;
                    const seat2BarX = player2.x - seat2BarW / 2;
                    const seat2BarY = player2.y + 56;
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                    ctx.fillRect(seat2BarX, seat2BarY, seat2BarW, seat2BarH);
                    ctx.fillStyle = seat2HpRatio > 0.5 ? '#2ecc71' : seat2HpRatio > 0.25 ? '#f7b731' : '#ff6b6b';
                    ctx.fillRect(seat2BarX, seat2BarY, seat2BarW * seat2HpRatio, seat2BarH);
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(seat2BarX, seat2BarY, seat2BarW, seat2BarH);
                    ctx.font = 'bold 14px Poppins';
                }
            } else {
                ctx.fillStyle = player1.color;
                ctx.fillText(getShortDisplayName('Player 1'), player1.x, player1.y - 58);
                const p1HpRatio = Math.max(0, Math.min(1, Number(player1.health || 0) / Math.max(1, Number(player1.maxHealth || 100))));
                const p1BarW = 46;
                const p1BarH = 6;
                const p1BarX = player1.x - p1BarW / 2;
                const p1BarY = player1.y + 56;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.fillRect(p1BarX, p1BarY, p1BarW, p1BarH);
                ctx.fillStyle = p1HpRatio > 0.5 ? '#2ecc71' : p1HpRatio > 0.25 ? '#f7b731' : '#ff6b6b';
                ctx.fillRect(p1BarX, p1BarY, p1BarW * p1HpRatio, p1BarH);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.lineWidth = 1;
                ctx.strokeRect(p1BarX, p1BarY, p1BarW, p1BarH);
                ctx.font = 'bold 14px Poppins';

                ctx.fillStyle = player2.color;
                ctx.fillText(getShortDisplayName('Player 2'), player2.x, player2.y - 58);
                const p2HpRatio = Math.max(0, Math.min(1, Number(player2.health || 0) / Math.max(1, Number(player2.maxHealth || 100))));
                const p2BarW = 46;
                const p2BarH = 6;
                const p2BarX = player2.x - p2BarW / 2;
                const p2BarY = player2.y + 56;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.fillRect(p2BarX, p2BarY, p2BarW, p2BarH);
                ctx.fillStyle = p2HpRatio > 0.5 ? '#2ecc71' : p2HpRatio > 0.25 ? '#f7b731' : '#ff6b6b';
                ctx.fillRect(p2BarX, p2BarY, p2BarW * p2HpRatio, p2BarH);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.lineWidth = 1;
                ctx.strokeRect(p2BarX, p2BarY, p2BarW, p2BarH);
                ctx.font = 'bold 14px Poppins';
            }

            ctx.restore();

            // HUD
            drawPowerBar(currentPlayerObj);
            drawPlayerHud(player1);
            drawPlayerHud(player2);
            drawKillingTimeAnnouncement();
        }

        function gameLoop() {
            update();
            draw();
            requestAnimationFrame(gameLoop);
        }

        // Initialize terrain on load
        initTerrain();
        if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') {
            auth.onAuthStateChanged((user) => {
                if (user && user.uid) {
                    online.localUid = user.uid;
                }
                updateOnlineAuthState(user || null);
                updatePrepPlayerNames();
                syncLocalParticipantName();
            });
        } else {
            updateOnlineAuthState(null);
            updatePrepPlayerNames();
        }
        updateRoomMeta();
        gameLoop();
