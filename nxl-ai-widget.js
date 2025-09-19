
/*! Nexus Luma AI — Web Component Widget (Shadow DOM, no-conflict)
 *  Usage:
 *    <script src="https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/vapi.js"></script> <!-- (optional; we lazy-load if missing) -->
 *    <script src="nxl-ai-widget.js" defer></script>
 *    <nxl-ai-widget public-key="YOUR_VAPI_PUBLIC_KEY" assistant-id="YOUR_ASSISTANT_ID"></nxl-ai-widget>
 *
 *  Attributes:
 *    public-key       (required) Vapi public API key
 *    assistant-id     (required) Vapi assistant ID
 *    theme            (optional) "dark" (default) | "light"
 *    position         (optional) "bottom-right" (default) | "bottom-left"
 *    open             (optional) "true" to start opened
 *
 *  Notes:
 *    - Uses Shadow DOM to isolate CSS. Won't affect host styles.
 *    - Auto-loads the Vapi Web SDK if window.Vapi is missing.
 *    - "Tap-to-talk": first click requests mic permission; if granted, Vapi speaks first.
 *    - Text mode is forwarded to Vapi via vapi.sendText if available; otherwise disabled gracefully.
 */
(function(){
  const WIDGET_VERSION = "1.0.0";
  const VAPI_CDN = "https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest/dist/vapi.js";

  class NexusLumaAIWidget extends HTMLElement {
    constructor(){
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._isOpen = false;
      this._isConnected = false;
      this._isListening = false;
      this._elements = {};
      this._vapi = null;
      this._mounted = false;
    }

    static get observedAttributes(){
      return ['open','theme','position','public-key','assistant-id'];
    }

    attributeChangedCallback(name, oldV, newV){
      if (!this._mounted) return;
      if (name === 'open'){
        (this.hasAttribute('open') && this.getAttribute('open') !== 'false') ? this.open() : this.close();
      }
      if (name === 'theme'){
        this._applyTheme();
      }
      if (name === 'position'){
        this._applyPosition();
      }
    }

    connectedCallback(){
      if (this._mounted) return;
      this._mounted = true;

      // Basic guards
      const publicKey = this.getAttribute('public-key');
      const assistantId = this.getAttribute('assistant-id');
      if(!publicKey || !assistantId){
        console.warn('[NexusLumaAI] Missing public-key and/or assistant-id attributes on <nxl-ai-widget>.');
      }

      // Render UI
      this._render();
      this._applyTheme();
      this._applyPosition();

      // Lazy-load Vapi SDK if needed
      this._ensureVapi().then(() => {
        this._initVapiClient(publicKey, assistantId);
      }).catch((err)=>{
        console.error('[NexusLumaAI] Failed to load Vapi SDK:', err);
        this._setStatus('SDK load failed');
      });

      // Open if requested initially
      if (this.hasAttribute('open') && this.getAttribute('open') !== 'false'){
        this.open();
      }
    }

    // ---------- Public API ----------
    open(){ 
      this._isOpen = true; 
      this._elements.panel.classList.add('open');
      this._elements.fab.classList.add('active');
      this._flashProjectionLine(true);
    }
    close(){ 
      this._isOpen = false; 
      this._elements.panel.classList.remove('open');
      this._elements.fab.classList.remove('active');
      this._flashProjectionLine(false);
    }
    toggle(){ this._isOpen ? this.close() : this.open(); }

    // ---------- Internals ----------
    async _ensureVapi(){
      if (window.Vapi) return;
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = VAPI_CDN;
        s.async = true;
        s.onload = ()=> resolve();
        s.onerror = ()=> reject(new Error('Failed to load ' + VAPI_CDN));
        document.head.appendChild(s);
      });
    }

    _initVapiClient(publicKey, assistantId){
      if (!window.Vapi) {
        console.error('[NexusLumaAI] Vapi SDK unavailable on window.');
        return;
      }
      try {
        this._vapi = new window.Vapi(publicKey);
        // Connections state callbacks if available
        if (this._vapi.on) {
          this._vapi.on('call.started', () => { this._setStatus('Connected'); this._isConnected = true; });
          this._vapi.on('call.ended', () => { this._setStatus('Disconnected'); this._isConnected = false; this._isListening = false; this._elements.mic.classList.remove('on'); });
          this._vapi.on('speech.started', () => { this._pulse(true); });
          this._vapi.on('speech.ended', () => { this._pulse(false); });
        }

        // Hook buttons
        this._elements.fab.addEventListener('click', ()=> this.toggle());
        this._elements.close.addEventListener('click', ()=> this.close());
        this._elements.mic.addEventListener('click', ()=> this._toggleMic(assistantId));
        this._elements.modeSwitch.addEventListener('click', ()=> this._toggleMode());
        this._elements.send.addEventListener('click', ()=> this._sendText());
        this._elements.textInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') this._sendText(); });

      } catch(e){
        console.error('[NexusLumaAI] Error creating Vapi client:', e);
        this._setStatus('Init error');
      }
    }

    async _toggleMic(assistantId){
      if (!this._vapi) return;
      if (!this._isListening){
        // Request mic permission; if granted, start the call.
        try{
          await navigator.mediaDevices.getUserMedia({ audio: true });
          // Vapi speaks first by default in many setups; we call start with assistant id
          if (this._vapi.start) {
            await this._vapi.start(assistantId);
          } else if (this._vapi.connectToAssistant) {
            // older SDK signatures
            await this._vapi.connectToAssistant(assistantId);
          } else {
            console.warn('[NexusLumaAI] No start/connectToAssistant API found on Vapi instance.');
          }
          this._isListening = true;
          this._elements.mic.classList.add('on');
          this._setStatus('Listening...');
        }catch(err){
          console.error('[NexusLumaAI] Mic permission denied or start failed:', err);
          this._setStatus('Mic blocked');
        }
      } else {
        try{
          if (this._vapi.stop) await this._vapi.stop();
          this._isListening = false;
          this._elements.mic.classList.remove('on');
          this._setStatus('Idle');
        }catch(err){
          console.error('[NexusLumaAI] stop() failed:', err);
        }
      }
    }

    _toggleMode(){
      const panel = this._elements.panel;
      panel.classList.toggle('text-mode');
      const isText = panel.classList.contains('text-mode');
      this._elements.modeSwitch.textContent = isText ? 'Voice' : 'Text';
    }

    async _sendText(){
      const value = (this._elements.textInput.value || '').trim();
      if (!value) return;
      if (this._vapi && typeof this._vapi.sendText === 'function'){
        try{
          await this._vapi.sendText(value);
          this._appendMsg('user', value);
          this._elements.textInput.value = '';
        } catch(err){
          console.error('[NexusLumaAI] sendText failed:', err);
        }
      } else {
        console.warn('[NexusLumaAI] sendText API not available in this SDK version.');
      }
    }

    _appendMsg(type, content){
      const item = document.createElement('div');
      item.className = 'msg ' + type;
      item.textContent = content;
      this._elements.chat.appendChild(item);
      this._elements.chat.scrollTop = this._elements.chat.scrollHeight;
    }

    _setStatus(s){
      this._elements.status.textContent = s;
    }

    _pulse(on){
      this._elements.fab.classList.toggle('pulsing', !!on);
    }

    _flashProjectionLine(on){
      this._elements.projection.style.opacity = on ? '1' : '0';
    }

    _applyTheme(){
      const theme = (this.getAttribute('theme') || 'dark').toLowerCase();
      this._root.host.toggleAttribute('data-theme-dark', theme === 'dark');
      this._root.host.toggleAttribute('data-theme-light', theme === 'light');
    }
    _applyPosition(){
      const pos = (this.getAttribute('position') || 'bottom-right').toLowerCase();
      this._root.host.setAttribute('data-pos', pos);
    }

    _render(){
      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          contain: content;
          position: fixed;
          inset: auto 24px 24px auto;
          z-index: 2147483647;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Apple Color Emoji","Segoe UI Emoji";
        }
        :host([data-pos="bottom-left"]) { inset: auto auto 24px 24px; }

        .fab {
          width: 68px; height: 68px; border-radius: 50%;
          display: grid; place-items: center; cursor: pointer;
          background: radial-gradient(circle at 30% 30%, #1b1b1b, #0f0f0f 60%);
          border: 2px solid rgba(255,255,255,.22);
          color: #eaeaea; font-size: 26px;
          box-shadow: 0 0 18px rgba(170,170,255,.25);
          transition: transform .15s ease, box-shadow .3s ease, filter .2s ease;
        }
        .fab:hover { transform: translateY(-1px) scale(1.02); }
        .fab.active { box-shadow: 0 0 26px rgba(160,160,255,.35); }
        .fab.pulsing { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%{ filter: drop-shadow(0 0 0 rgba(136,136,255,.35)); } 50%{ filter: drop-shadow(0 0 18px rgba(136,136,255,.55)); } 100%{ filter: drop-shadow(0 0 0 rgba(136,136,255,.35)); } }

        .icon { pointer-events: none; }
        .projection { position: absolute; bottom: 78px; right: 34px; width: 2px; height: 32px; background: linear-gradient(to top, rgba(160,160,255,.7), transparent); opacity: 0; transition: opacity .25s ease; }

        .panel {
          position: absolute; bottom: 96px; right: 0;
          min-width: 320px; width: 360px; max-width: 92vw;
          border-radius: 18px; overflow: hidden; backdrop-filter: blur(8px);
          background: linear-gradient( to bottom right, rgba(18,18,26,.88), rgba(10,10,14,.88) );
          border: 1px solid rgba(255,255,255,.12);
          box-shadow: 0 16px 40px rgba(0,0,0,.45), 0 0 60px rgba(136,136,255,.15);
          opacity: 0; transform: translateY(12px) scale(.98); pointer-events: none;
          transition: opacity .18s ease, transform .18s ease;
        }
        .panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

        .header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.08);
          color: #f1f1f1; font-weight: 600; font-size: 14px;
        }
        .row { display: flex; gap: 8px; align-items: center; }
        .btn { appearance: none; background: transparent; color: #eaeaea; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: rgba(255,255,255,.06); }

        .body { padding: 10px; display: grid; gap: 10px; }
        .status { font-size: 12px; color: #cfcfe8; opacity: .9; }

        .mic { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.14); cursor: pointer; }
        .mic.on { background: rgba(170,170,255,.12); box-shadow: inset 0 0 0 1px rgba(170,170,255,.25); }

        .chat { height: 180px; overflow: auto; padding: 8px; border-radius: 12px; background: linear-gradient(to bottom, rgba(255,255,255,.03), rgba(255,255,255,.01)); border: 1px solid rgba(255,255,255,.08); }
        .msg { font-size: 13px; line-height: 1.35; padding: 6px 8px; border-radius: 8px; margin: 6px 0; }
        .msg.user { background: rgba(120,120,255,.12); }
        .msg.assistant { background: rgba(255,255,255,.06); }

        .composer { display: flex; gap: 6px; }
        .composer input { flex: 1; min-width: 0; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); color: #eaeaea; border-radius: 10px; padding: 8px 10px; font-size: 13px; }
        .composer button { white-space: nowrap; }

        /* Light theme tweaks */
        :host([data-theme-light]) .panel { background: linear-gradient( to bottom right, rgba(255,255,255,.92), rgba(245,245,255,.92) ); color: #202020; }
        :host([data-theme-light]) .header { color: #101010; }
        :host([data-theme-light]) .btn, :host([data-theme-light]) .mic { border-color: rgba(0,0,0,.12); color: #1a1a1a; }
        :host([data-theme-light]) .composer input { background: rgba(255,255,255,.9); border-color: rgba(0,0,0,.12); color: #111; }
      `;

      const wrapper = document.createElement('div');
      wrapper.innerHTML = `
        <div class="fab" part="fab" aria-label="Open AI Assistant">
          <svg class="icon" width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="3.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </div>
        <div class="projection"></div>
        <div class="panel" role="dialog" aria-modal="false">
          <div class="header">
            <div class="row">Nexus Luma — AI Assistant</div>
            <div class="row">
              <button class="btn mode">Text</button>
              <button class="btn close" aria-label="Close">✕</button>
            </div>
          </div>
          <div class="body">
            <div class="row">
              <div class="mic" title="Toggle microphone">
                🎙️
              </div>
              <div class="status">Idle</div>
            </div>
            <div class="chat" aria-live="polite"></div>
            <div class="composer">
              <input class="text-input" type="text" placeholder="Type a message…"/>
              <button class="btn send">Send</button>
            </div>
          </div>
        </div>
      `;

      this._root.appendChild(style);
      this._root.appendChild(wrapper);

      // refs
      this._elements.fab = this._root.querySelector('.fab');
      this._elements.panel = this._root.querySelector('.panel');
      this._elements.projection = this._root.querySelector('.projection');
      this._elements.close = this._root.querySelector('.close');
      this._elements.mic = this._root.querySelector('.mic');
      this._elements.modeSwitch = this._root.querySelector('.mode');
      this._elements.status = this._root.querySelector('.status');
      this._elements.chat = this._root.querySelector('.chat');
      this._elements.send = this._root.querySelector('.send');
      this._elements.textInput = this._root.querySelector('.text-input');
    }
  }

  customElements.define('nxl-ai-widget', NexusLumaAIWidget);
})();
