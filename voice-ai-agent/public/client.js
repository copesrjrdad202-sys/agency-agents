// Frontend demo client: microphone capture, transcript rendering, audio playback.
(function () {
  const micBtn = document.getElementById('micBtn');
  const statusEl = document.getElementById('status');
  const transcriptEl = document.getElementById('transcript');
  const player = document.getElementById('player');
  const textInput = document.getElementById('textInput');
  const sendBtn = document.getElementById('sendBtn');

  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let sessionId = localStorage.getItem('voiceAgentSessionId') || null;

  function addBubble(text, kind) {
    const div = document.createElement('div');
    div.className = `bubble ${kind}`;
    div.textContent = text;
    transcriptEl.appendChild(div);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  async function sendToServer(formData) {
    setStatus('Thinking...');
    try {
      const response = await fetch('/api/voice/incoming', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        addBubble(`⚠️ ${data.error || 'Something went wrong.'}`, 'system');
        setStatus('Ready.');
        return;
      }

      sessionId = data.sessionId;
      localStorage.setItem('voiceAgentSessionId', sessionId);

      if (data.transcript) addBubble(data.transcript, 'user');
      if (data.reply) addBubble(data.reply, 'ai');

      if (data.toolCalls && data.toolCalls.length > 0) {
        const toolSummary = data.toolCalls
          .map((t) => `🔧 ${t.name}(${JSON.stringify(t.input)})`)
          .join('\n');
        addBubble(toolSummary, 'system');
      }

      if (data.audioBase64) {
        const src = `data:${data.audioMimeType};base64,${data.audioBase64}`;
        player.src = src;
        player.play().catch(() => {
          /* Autoplay might be blocked; user can replay manually via console if needed. */
        });
      }

      setStatus(`Ready. (${data.elapsedMs}ms round trip)`);
    } catch (err) {
      addBubble(`⚠️ Network error: ${err.message}`, 'system');
      setStatus('Ready.');
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob, 'speech.webm');
        formData.append('encoding', 'WEBM_OPUS');
        formData.append('sampleRateHertz', '48000');
        if (sessionId) formData.append('sessionId', sessionId);
        await sendToServer(formData);
      };
      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('recording');
      setStatus('Listening... click again to stop.');
    } catch (err) {
      setStatus(`Microphone error: ${err.message}`);
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.classList.remove('recording');
      setStatus('Processing...');
    }
  }

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  async function sendText() {
    const text = textInput.value.trim();
    if (!text) return;
    textInput.value = '';
    const formData = new FormData();
    formData.append('text', text);
    if (sessionId) formData.append('sessionId', sessionId);
    await sendToServer(formData);
  }

  sendBtn.addEventListener('click', sendText);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendText();
  });

  addBubble('Hi! I\'m Ava from your Voice AI Agent demo. Click the mic or type to start.', 'ai');
})();
