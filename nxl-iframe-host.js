
/*! Host-side loader for the iFrame widget
 *  Usage:
 *    <script src="nxl-iframe-host.js" defer></script>
 *    <div id="nxl-mount"></div>
 *    <script>
 *      NXL.mountIframeWidget({
 *        mount: document.getElementById('nxl-mount'),
 *        publicKey: 'YOUR_VAPI_PUBLIC_KEY',
 *        assistantId: 'YOUR_ASSISTANT_ID',
 *        position: 'bottom-right' // or 'bottom-left'
 *      });
 *    </script>
 */
(function(){
  const CSS = `
    .nxl-fab{position:fixed;z-index:2147483647;width:68px;height:68px;border-radius:50%;
      display:grid;place-items:center;cursor:pointer;background:radial-gradient(circle at 30% 30%,#1b1b1b,#0f0f0f 60%);
      border:2px solid rgba(255,255,255,.22);color:#eaeaea;font-size:26px;box-shadow:0 0 18px rgba(170,170,255,.25);
      transition:transform .15s ease, box-shadow .3s ease, filter .2s ease;bottom:24px;right:24px}
    .nxl-fab.nxl-left{left:24px;right:auto}
    .nxl-fab:hover{transform:translateY(-1px) scale(1.02)}
    .nxl-fab.nxl-pulse{animation:nxl-pulse 1.8s ease-in-out infinite}
    @keyframes nxl-pulse{0%{filter:drop-shadow(0 0 0 rgba(136,136,255,.35))}50%{filter:drop-shadow(0 0 18px rgba(136,136,255,.55))}100%{filter:drop-shadow(0 0 0 rgba(136,136,255,.35))}}
    .nxl-frame{position:fixed;z-index:2147483647;width:360px;max-width:92vw;height:320px;border:0;border-radius:18px;overflow:hidden;
      box-shadow:0 16px 40px rgba(0,0,0,.45),0 0 60px rgba(136,136,255,.15);bottom:96px;right:24px;background:transparent;opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
    .nxl-frame.nxl-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}
    .nxl-frame.nxl-left{left:24px;right:auto}
  `;

  function ensureStyle(){
    if (document.getElementById('nxl-style')) return;
    const s = document.createElement('style');
    s.id = 'nxl-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function createSVG(){
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width','28'); svg.setAttribute('height','28'); svg.setAttribute('viewBox','0 0 24 24');
    const p1 = document.createElementNS(svgNS,'path'); p1.setAttribute('d','M12 3a9 9 0 1 0 9 9'); p1.setAttribute('stroke','currentColor'); p1.setAttribute('fill','none'); p1.setAttribute('stroke-width','1.5');
    const c = document.createElementNS(svgNS,'circle'); c.setAttribute('cx','12'); c.setAttribute('cy','12'); c.setAttribute('r','3.5'); c.setAttribute('stroke','currentColor'); c.setAttribute('fill','none'); c.setAttribute('stroke-width','1.5');
    svg.appendChild(p1); svg.appendChild(c);
    return svg;
  }

  function mountIframeWidget(opts){
    const { mount, publicKey, assistantId, position='bottom-right' } = opts || {};
    if (!mount) throw new Error('NXL.mountIframeWidget: opts.mount is required');
    if (!publicKey || !assistantId) console.warn('[NXL] Missing Vapi keys.');
    ensureStyle();

    const fab = document.createElement('button');
    fab.className = 'nxl-fab' + (position.includes('left') ? ' nxl-left' : '');
    fab.setAttribute('aria-label','Open AI Assistant');
    fab.appendChild(createSVG());

    const iframe = document.createElement('iframe');
    iframe.className = 'nxl-frame' + (position.includes('left') ? ' nxl-left' : '');
    iframe.allow = 'microphone; autoplay';
    const origin = location.origin;
    iframe.src = (opts.widgetUrl || 'nxl-iframe.html') + `?publicKey=${encodeURIComponent(publicKey)}&assistantId=${encodeURIComponent(assistantId)}&host=${encodeURIComponent(origin)}`;

    mount.appendChild(fab);
    mount.appendChild(iframe);

    let open = false;
    function toggle(){
      open = !open;
      iframe.classList.toggle('nxl-open', open);
      window.postMessage({ source:'NXL_HOST', type: open?'open':'close' }, '*');
    }
    fab.addEventListener('click', toggle);

    addEventListener('message', (e)=>{
      const {data} = e;
      if (!data || data.source !== 'NXL_IFRAME') return;
      if (data.type === 'ready'){ /* could switch icon state */ }
      if (data.type === 'state'){ fab.classList.toggle('nxl-pulse', !!(data.payload && data.payload.listening)); }
      if (data.type === 'error'){ console.warn('[NXL iframe] error:', data.payload); }
      if (data.type === 'close' && open){ toggle(); }
      if (data.type === 'sendText'){ /* echo if desired */ }
    });

    return { open: ()=>{ if(!open) toggle(); }, close: ()=>{ if(open) toggle(); }, sendText: (t)=> iframe.contentWindow.postMessage({source:'NXL_HOST',type:'sendText',payload:String(t||'')}, '*') };
  }

  window.NXL = { mountIframeWidget };
})();
