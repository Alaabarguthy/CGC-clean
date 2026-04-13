import { Config } from './config.js';

export const VoiceService = {
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    autoSpeak: true, // User can toggle this

    async startRecording() {
        try {
            // Capacitor Native Permission Request
            if (window.Capacitor?.isNativePlatform()) {
                console.log("[Voice] Native platform detected. Checking permissions...");
                const status = await navigator.permissions.query({ name: 'microphone' });
                if (status.state === 'denied') {
                    throw new Error("Microphone permission denied locally.");
                }
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.start();
            return true;
        } catch (e) {
            console.error("Recording failed", e);
            let msg = "Microphone Access Denied";
            let detail = "Please enable microphone access in settings.";

            if (window.Capacitor?.isNativePlatform()) {
                detail = "Go to Phone Settings > Apps > ARTELCO > Permissions and 'Allow Microphone'.";
            } else if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
                detail = "Browsers block microphone on insecure HTTP. Please use HTTPS or localhost.";
            }

            appAlert(msg, detail, 'error');
            return false;
        }
    },

    async stopRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return null;

        return new Promise((resolve) => {
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                this.isRecording = false;

                // Transcribe
                const text = await this.transcribe(audioBlob);

                resolve({ text, audioUrl, blob: audioBlob });

                // Stop all tracks to release microphone
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            };
            this.mediaRecorder.stop();
        });
    },

    async transcribe(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', 'whisper-1'); // Correct model for transcription

        // Context prompt to refine transcription accuracy for ARTELCO context
        formData.append('prompt', 'Transcribe the audio accurately. The speaker uses English or Jordanian Arabic (Ammiya) to discuss ERP data, stock, and costs.');

        const directUrl = 'https://api.openai.com/v1/audio/transcriptions';
        const proxyUrl = Config.getProxyUrl('openai-transcriptions');

        try {
            const response = await fetch(directUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${Config.getOpenAiApiKey()}`
                },
                body: formData
            });

            if (!response.ok) throw new Error(`Direct STT failed: ${response.status}`);
            const data = await response.json();
            return data.text;
        } catch (e) {
            console.warn("[Voice] Direct STT failed, trying proxy...", e);
            try {
                const proxyRes = await fetch(proxyUrl, {
                    method: 'POST',
                    body: formData
                });
                if (!proxyRes.ok) return null;
                const proxyData = await proxyRes.json();
                return proxyData.text || null;
            } catch (proxyErr) {
                console.error("Transcription error", proxyErr);
                return null;
            }
        }
    },

    async getVoiceResponse(text) {
        if (!text) return null;

        let cleanText = text.split('[TABLE]')[0].split('[ACTION]')[0].trim();
        cleanText = cleanText.replace(/\*\*/g, '').replace(/\n/g, ' ');

        const directUrl = 'https://api.openai.com/v1/audio/speech';
        const proxyUrl = Config.getProxyUrl('openai-tts');

        try {
            const response = await fetch(directUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${Config.getOpenAiApiKey()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1', // Correct model for speech
                    input: cleanText,
                    voice: 'cedar', // Optimized for high quality
                    instructions: "Speak in a professional, clear Jordanian Arabic tone (Ammiya) as if you are a helpful technical assistant."
                })
            });

            if (!response.ok) throw new Error(`Direct TTS failed: ${response.status}`);

            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch (e) {
            console.warn("[Voice] Direct TTS failed, trying proxy...", e);
            try {
                const proxyResponse = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'tts-1',
                        input: cleanText,
                        voice: 'cedar',
                        instructions: "Speak in a professional, clear Jordanian Arabic tone (Ammiya) as if you are a helpful technical assistant."
                    })
                });
                if (!proxyResponse.ok) return null;
                const blob = await proxyResponse.blob();
                return URL.createObjectURL(blob);
            } catch (proxyErr) {
                console.error("TTS failed", proxyErr);
                return null;
            }
        }
    }
};
