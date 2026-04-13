import { AiAgent } from '../services/ai.js';
import { AuthService } from '../services/api.js';
import { Config } from '../services/config.js';

export default class CallView {
    async render() {
        const user = AuthService.getUser();
        if (!user) {
            window.app.router.navigate('login');
            return document.createElement('div');
        }

        const container = document.createElement('div');
        container.className = 'view-call';
        container.style = `
            height: 100vh;
            background: #000000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            padding: calc(40px + var(--safe-area-top)) 24px calc(40px + var(--safe-area-bottom));
            color: white;
            position: relative;
            overflow: hidden;
            z-index: 2000;
        `;
        this.container = container;

        container.innerHTML = `
            <!-- Background Pulse Animation -->
            <div class="call-pulse-container" style="position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%); z-index: 0;">
                <div class="pulse-ring" style="width: 200px; height: 200px; border: 2px solid rgba(255,255,255,0.1); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); animation: call-pulse 4s infinite;"></div>
                <div class="pulse-ring" style="width: 250px; height: 250px; border: 2px solid rgba(255,255,255,0.05); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); animation: call-pulse 4s infinite 1s;"></div>
                <div class="pulse-ring" style="width: 300px; height: 300px; border: 2px solid rgba(255,255,255,0.02); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); animation: call-pulse 4s infinite 2s;"></div>
            </div>

            <div style="text-align: center; z-index: 1;">
                <div style="font-size: 14px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.7; margin-bottom: 12px; font-weight: 500;">ARTELCO Realtime</div>
                <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 8px;">AI Agent</h1>
                <div id="call-status" style="font-size: 18px; color: #34D399; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span class="status-dot" style="width: 8px; height: 8px; background: #34D399; border-radius: 50%; animation: pulse 2s infinite;"></span>
                    <span>READY TO CALL</span>
                </div>
            </div>

            <div style="position: relative; z-index: 1;">
                <div id="avatar-container" style="width: 160px; height: 160px; border-radius: 50%; background: linear-gradient(135deg, #00A4E0 0%, #002B5C 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 50px rgba(0, 164, 224, 0.3); border: 4px solid rgba(255,255,255,0.1);">
                    <span class="material-icons-round" style="font-size: 80px; color: white;">smart_toy</span>
                </div>
                <div id="audio-wave" style="position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; height: 30px; align-items: flex-end; opacity: 0;">
                    <div class="wave-bar" style="width: 4px; height: 10px; background: #34D399; border-radius: 2px; animation: wave-anim 1s infinite;"></div>
                    <div class="wave-bar" style="width: 4px; height: 20px; background: #34D399; border-radius: 2px; animation: wave-anim 1s infinite 0.2s;"></div>
                    <div class="wave-bar" style="width: 4px; height: 15px; background: #34D399; border-radius: 2px; animation: wave-anim 1s infinite 0.4s;"></div>
                    <div class="wave-bar" style="width: 4px; height: 25px; background: #34D399; border-radius: 2px; animation: wave-anim 1s infinite 0.1s;"></div>
                    <div class="wave-bar" style="width: 4px; height: 12px; background: #34D399; border-radius: 2px; animation: wave-anim 1s infinite 0.3s;"></div>
                </div>
            </div>

            <div style="width: 100%; display: flex; flex-direction: column; gap: 40px; align-items: center; z-index: 1;">
                <div id="call-transcript" style="width: 100%; max-height: 100px; overflow-y: auto; text-align: center; font-size: 16px; font-style: italic; opacity: 0.8; padding: 0 20px; line-height: 1.5; scrollbar-width: none;">
                    Press call to start conversation
                </div>

                <div style="display: flex; gap: 40px; align-items: center;">
                    <button id="toggle-mic" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.1); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        <span class="material-icons-round">mic</span>
                    </button>

                    <button id="call-main-btn" style="width: 80px; height: 80px; border-radius: 50%; background: #34D399; border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 10px 20px rgba(52, 211, 153, 0.3); transition: all 0.3s;">
                        <span class="material-icons-round" style="font-size: 40px;">phone</span>
                    </button>

                    <button id="close-call" style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.1); border: none; color: white; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
            </div>

            <style>
                @keyframes call-pulse {
                    0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
                    100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
                }

                @keyframes wave-anim {
                    0%, 100% { height: 10px; }
                    50% { height: 30px; }
                }

                .wave-active .wave-bar {
                    animation-play-state: running !important;
                }

                .view-call.calling #call-main-btn {
                    background: #EF4444;
                    transform: rotate(135deg);
                    box-shadow: 0 10px 20px rgba(239, 68, 68, 0.3);
                }
            </style>
        `;

        this.isCalling = false;
        this.pc = null;
        this.dataChannel = null;

        return container;
    }

    afterRender() {
        this.applyEvents();
    }

    applyEvents() {
        const callBtn = this.container.querySelector('#call-main-btn');
        const closeBtn = this.container.querySelector('#close-call');
        const micBtn = this.container.querySelector('#toggle-mic');

        callBtn.onclick = () => {
            if (this.isCalling) {
                this.stopCall();
            } else {
                this.startCall();
            }
        };

        closeBtn.onclick = () => {
            this.stopCall();
            window.app.router.navigate('home');
        };

        micBtn.onclick = () => {
            const icon = micBtn.querySelector('span');
            if (icon.innerText === 'mic') {
                icon.innerText = 'mic_off';
                micBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            } else {
                icon.innerText = 'mic';
                micBtn.style.background = 'rgba(255,255,255,0.1)';
            }
        };
    }

    async startCall() {
        this.isCalling = true;
        this.container.classList.add('calling');
        const statusEl = this.container.querySelector('#call-status');
        const transcriptEl = this.container.querySelector('#call-transcript');
        const waveEl = this.container.querySelector('#audio-wave');

        statusEl.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background: #6366F1; border-radius: 50%; animation: pulse 1s infinite;"></span><span>PERMISSION REQ...</span>';
        transcriptEl.innerText = "Please allow microphone access when prompted.";

        try {
            const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            statusEl.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background: #34D399; border-radius: 50%; opacity: 0.5;"></span><span>DIALING...</span>';
            transcriptEl.innerText = "Connecting to ARTELCO AI...";

            const sessionData = await this.getRealtimeSessionData();
            
            if (!sessionData || !sessionData.value) {
                console.error("OpenAI Realtime Failed:", sessionData);
                throw new Error(`Session failed: ${sessionData.error?.message || 'Check your API Key'}`);
            }

            const EPHEMERAL_KEY = sessionData.value;

            this.pc = new RTCPeerConnection();

            const audioEl = document.createElement("audio");
            audioEl.autoplay = true;
            this.pc.ontrack = e => audioEl.srcObject = e.streams[0];

            this.pc.addTrack(ms.getTracks()[0]);

            this.dataChannel = this.pc.createDataChannel("oai-events");

            this.dataChannel.addEventListener("open", () => {
                const sessionUpdate = {
                    type: "session.update",
                    session: {
                        type: "realtime",
                        instructions: `
# Identity
You are "Leila", the ARTELCO AI Assistant. You are a warm, polite, and extremely feminine Jordanian woman from Amman.

# Tone & Accent
Very feminine, helpful, and energetic. **CRITICAL: Speak ONLY in Amman/Jordanian Ammiya.** 

# Pronunciation Rules
- Use "Hassa" (هسا) for "Now".
- Use "Shu" (شو) for "What".
- Use "Kwayes" (كويس) or "Tamam" (تمام) instead of "Jayyid".
- Pronounce "Qaf" (ق) as a glottal stop (like Hamza) or "G" as appropriate for Amman. 
- Use "Ya Hala" (يا هلا) frequently.

# Role
- Help staff manage Tickets, Stock, and Customers.
- When results are returned, summarize them like a real Jordanian colleague would.
- Keep it professional but very friendly.
`.trim(),
                        audio: {
                            input: {
                                turn_detection: {
                                    type: "server_vad",
                                    threshold: 0.5,
                                    prefix_padding_ms: 300,
                                    silence_duration_ms: 500
                                }
                            },
                            output: {
                                voice: "coral",
                                speed: 1.25
                            }
                        },
                        tools: [
                            {
                                type: "function",
                                name: "searchStock",
                                description: "Finds items by SKU or Name. Returns stock and costs.",
                                parameters: {
                                    type: "object",
                                    properties: { query: { type: "string" } },
                                    required: ["query"]
                                }
                            },
                            {
                                type: "function",
                                name: "searchCustomers",
                                description: "Finds clients by name or ID.",
                                parameters: {
                                    type: "object",
                                    properties: { query: { type: "string" } },
                                    required: ["query"]
                                }
                            },
                            {
                                type: "function",
                                name: "getTickets",
                                description: "Gets active tickets for the current user.",
                                parameters: { type: "object", properties: {} }
                            },
                            {
                                type: "function",
                                name: "getCurrentUser",
                                description: "Returns the currently logged in staff member profile.",
                                parameters: { type: "object", properties: {} }
                            }
                        ],
                        tool_choice: "auto"
                    }
                };
                this.dataChannel.send(JSON.stringify(sessionUpdate));
            });

            this.dataChannel.addEventListener("message", (ev) => {
                const msg = JSON.parse(ev.data);
                this.handleVoiceMessage(msg);
            });

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            const baseUrl = "https://api.openai.com/v1/realtime/calls";
            const sdpResponse = await fetch(`${baseUrl}?model=gpt-4o-realtime-preview`, {
                method: "POST",
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${EPHEMERAL_KEY}`,
                    "Content-Type": "application/sdp",
                },
            });

            if (!sdpResponse.ok) {
                const sdpError = await sdpResponse.text();
                throw new Error(`SDP exchange failed: ${sdpError}`);
            }

            const answer = { type: "answer", sdp: await sdpResponse.text() };
            await this.pc.setRemoteDescription(answer);

            statusEl.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background: #34D399; border-radius: 50%; animation: pulse 2s infinite;"></span><span>IN CALL</span>';
            waveEl.style.opacity = "1";
            waveEl.classList.add('wave-active');

        } catch (e) {
            console.error("Call initialization failed", e);
            statusEl.innerHTML = `<span class="status-dot" style="width: 8px; height: 8px; background: #EF4444; border-radius: 50%;"></span><span>ERROR: ${e.name || 'UNKNOWN'}</span>`;

            transcriptEl.innerHTML = `
                <span style="color:#EF4444; font-weight:700;">Connection Failed</span><br>
                <code style="display:block; font-size:11px; margin-top:8px; padding:4px; background:rgba(255,255,255,0.1); border-radius:4px;">
                    ${e.name}: ${e.message}
                </code>
            `;
            this.isCalling = false;
            this.container.classList.remove('calling');
        }
    }

    async getRealtimeSessionData() {
        // Localhost path (Vite plugin) and hosted path.
        try {
            const proxyResponse = await fetch(Config.getProxyUrl('openai-realtime'), { method: "POST" });
            if (proxyResponse.ok) return await proxyResponse.json();
        } catch (e) {
            console.warn("[Call] Proxy realtime init failed, trying direct...", e);
        }

        // Native/direct fallback to avoid dependency on deployed env vars.
        const directRes = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${Config.getOpenAiApiKey()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                session: {
                    type: "realtime",
                    model: "gpt-4o-realtime-preview",
                    instructions: "You are a professional technical assistant at ARTELCO.",
                    audio: { output: { voice: "cedar" } }
                }
            })
        });

        if (!directRes.ok) {
            const body = await directRes.text();
            throw new Error(`Realtime direct init failed: ${directRes.status} ${body}`);
        }

        return await directRes.json();
    }

    handleVoiceMessage(msg) {
        const transcriptEl = this.container.querySelector('#call-transcript');

        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
            transcriptEl.innerText = `You: "${msg.transcript.trim()}"`;
        }

        if (msg.type === 'response.output_audio_transcription.delta') {
            transcriptEl.innerText = msg.delta;
        }

        if (msg.type === 'response.function_call_arguments.done') {
            transcriptEl.innerText = "Searching ARTELCO records...";
            this.handleFunctionCall(msg);
        }

        if (msg.type === 'error') {
            console.error("Realtime Error:", msg.error);
            transcriptEl.innerText = `Error: ${msg.error.message}`;
        }
    }

    async handleFunctionCall(msg) {
        const params = JSON.parse(msg.arguments);
        let result = await AiAgent.executeTool(msg.name, params);

        if (msg.name === 'getTickets' && Array.isArray(result)) {
            result = result.slice(0, 10).map(t => ({
                id: t.DocumentNo,
                status: t.StatusName || "Open",
                customer: t.PartnerName,
                summary: t.Summary
            }));
        }

        let outputStr = JSON.stringify(result);
        if (outputStr.length > 15000) {
            outputStr = JSON.stringify({
                error: "DATA_SET_TOO_LARGE",
                message: "Ask the user to narrow down their search."
            });
        }

        const event = {
            type: "conversation.item.create",
            item: {
                type: "function_call_output",
                call_id: msg.call_id,
                output: outputStr,
            },
        };

        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(event));
            this.dataChannel.send(JSON.stringify({ type: "response.create" }));
        }
    }

    stopCall() {
        if (this.pc) {
            this.pc.getSenders().forEach(sender => sender.track && sender.track.stop());
            this.pc.close();
        }
        this.isCalling = false;
        this.container.classList.remove('calling');

        const statusEl = this.container.querySelector('#call-status');
        const transcriptEl = this.container.querySelector('#call-transcript');
        const waveEl = this.container.querySelector('#audio-wave');

        statusEl.innerHTML = '<span class="status-dot" style="width: 8px; height: 8px; background: #34D399; border-radius: 50%;"></span><span>READY TO CALL</span>';
        transcriptEl.innerText = "Press call to start conversation";
        waveEl.style.opacity = "0";
        waveEl.classList.remove('wave-active');
    }
}
