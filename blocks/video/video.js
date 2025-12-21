function embedYoutube(url, autoplay, background) {
  const usp = new URLSearchParams(url.search);
  let suffix = '';
  if (background || autoplay) {
    const suffixParams = {
      autoplay: autoplay ? '1' : '0',
      mute: background ? '1' : '0',
      controls: background ? '0' : '1',
      disablekb: background ? '1' : '0',
      loop: background ? '1' : '0',
      playsinline: background ? '1' : '0',
    };
    suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }

  // YouTube requires playlist=<videoid> for loop to work on embeds
  if (vid && (usp.get('loop') === '1' || usp.get('autoplay') === '1' || Object.keys(usp).length === 0)) {
    // nothing here - we'll append playlist via suffix when loop param set via suffixParams
  }

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
    </div>`;
  // if loop is requested and we have a video id, ensure playlist param is present
  if (vid && suffix.includes('loop=1') && !suffix.includes('playlist=')) {
    // append playlist param to the iframe src
    const node = temp.children.item(0).querySelector('iframe');
    if (node) {
      const src = node.getAttribute('src');
      node.setAttribute('src', `${src}&playlist=${vid}`);
    }
  }

  return temp.children.item(0);
}

function getVideoElement(source, autoplay, background) {
  const video = document.createElement('video');
  // remove controls, enable autoplay, loop and muted for reliable autoplay
  video.removeAttribute('controls');
  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.addEventListener('canplay', () => {
    try {
      video.play();
    } catch (e) {
      // play might be blocked depending on browser policies
    }
  });

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', `video/mp4`);
  video.append(sourceEl);

  return video;
}

const loadVideoEmbed = (block, link, autoplay, background) => {
  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  if (isYoutube) {
    const url = new URL(link);
    const embedWrapper = embedYoutube(url, autoplay, background);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, autoplay, background);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

export default function decorate(block) {
  console.log("video component called successfully");
  // try to locate a link or source for the video. templates vary; be permissive.
  const linkEl = block.querySelector(':scope div:nth-child(1) > div a') || block.querySelector(':scope a') || block.querySelector('video source') || block.querySelector('video');
  // derive the link from common attributes (href, data-src, src) or innerHTML
  let link = '';
  if (linkEl) {
    link = linkEl.getAttribute && (linkEl.getAttribute('href') || linkEl.getAttribute('data-src') || linkEl.getAttribute('data-video') || linkEl.getAttribute('data-video-url'))
      || linkEl.src || linkEl.innerHTML && linkEl.innerHTML.trim() || '';
  } else if (block.dataset) {
    // fallback to model-rendered data attribute on the block
    link = block.dataset.videoUrl || block.dataset.videourl || '';
  }
  console.log('link', link);

  // capture optional overlay content before clearing block
  const overlaySource = block.querySelector(':scope div:nth-child(2)');
  const overlayHTML = overlaySource ? overlaySource.innerHTML.trim() : '';

  // extract any AEM-rendered model nodes and anchors from the overlay/source BEFORE we clear the block
  let aueOverlayText = '';
  let aueOverlayCta = '';
  let aueOverlayCtaText = '';
  let aueOverlayPosition = '';
  if (overlaySource) {
    const t = overlaySource.querySelector('[data-aue-prop="overlayText"]');
    const c = overlaySource.querySelector('[data-aue-prop="overlayCtaUrl"]');
    const ct = overlaySource.querySelector('[data-aue-prop="overlayCtaText"]');
    const p = overlaySource.querySelector('[data-aue-prop="overlayPosition"]');
    aueOverlayText = t && t.textContent ? t.textContent.trim() : '';
    aueOverlayCta = c && c.textContent ? c.textContent.trim() : '';
    aueOverlayCtaText = ct && ct.textContent ? ct.textContent.trim() : '';
    aueOverlayPosition = p && p.textContent ? p.textContent.trim() : '';
  }
  // also capture any anchors present in the block before clearing
  const preAnchors = Array.from(block.querySelectorAll('a'));

  // read model-driven values if rendered as data attributes on the block
  const modelOverlayText = (block.dataset && block.dataset.overlayText) || block.getAttribute('data-overlay-text') || '';
  const modelOverlayCta = (block.dataset && block.dataset.overlayCtaUrl) || block.getAttribute('data-overlay-cta-url') || block.getAttribute('data-overlayctaurl') || '';
  const modelOverlayPosition = (block.dataset && block.dataset.overlayPosition) || block.getAttribute('data-overlay-position') || '';
  // try multiple possible attribute names that different templates might emit for CTA text
  const modelOverlayCtaText = (block.dataset && block.dataset.overlayCtaText) || block.getAttribute('data-overlay-cta-text') || block.getAttribute('data-overlayctatext') || block.getAttribute('data-cta-text') || '';

  // attempt to find CTA text rendered elsewhere in the same section (some templates render model fields outside the overlay)
  const findCtaTextInSection = (el) => {
    try {
      const section = el.closest && el.closest('.section') || document.body;
      if (!section) return '';
      // scan for model nodes, explicit data attrs, hidden nodes, or nodes with 'cta' / 'button' in class
      const selectorList = '[data-aue-prop], [data-overlay-cta-text], [data-overlayctatext], [data-cta-text], [data-ctatext], [style*="display:none"], [hidden], [class*="cta"], [class*="button"]';
      const candidates = Array.from(section.querySelectorAll(selectorList));
      for (let i = 0; i < candidates.length; i++) {
        const node = candidates[i];
        // prefer explicit data-aue-prop matching overlayCtaText
        const aue = node.getAttribute && node.getAttribute('data-aue-prop');
        if (aue && aue.toLowerCase().includes('overlayctatext')) {
          const txt = node.textContent && node.textContent.trim() || '';
          if (txt && !(txt === modelOverlayCta || /^https?:\/\//.test(txt) || txt.startsWith('/'))) return txt;
        }
        // pick concise human text content from hidden or utility nodes
        const txt = (node.getAttribute && node.getAttribute('content')) || (node.textContent && node.textContent.trim()) || '';
        if (!txt) continue;
        // ignore long blocks or urls
        if (txt.length > 80) continue;
        if (txt === modelOverlayCta) continue;
        if (/^https?:\/\//.test(txt) || txt.startsWith('/')) continue;
        // ignore generic 'true' / 'false' markers
        if (/^(true|false)$/i.test(txt)) continue;
        return txt;
      }
      return '';
    } catch (e) {
      return '';
    }
  };

  const extraCtaText = findCtaTextInSection(block) || '';

  block.textContent = '';
  block.dataset.embedLoaded = false;

  // force autoplay, loop and hide controls for this block
  loadVideoEmbed(block, link, true, true);

  // determine optional runtime config from model data attributes or overlay source

  // helper to extract anchor info from an overlay source node
  const extractAnchor = (node) => {
    if (!node) return { href: '', text: '' };
    const a = node.querySelector && (node.querySelector('a') || node.querySelector('[data-cta]'));
    if (a) {
      const href = a.getAttribute('href') || a.getAttribute('data-href') || a.getAttribute('data-src') || '';
      // prefer explicit data-ctatext, otherwise only use anchor text when it is not the raw href
      let text = a.getAttribute('data-ctatext') || (a.textContent && a.textContent.trim()) || '';
      const txtIsUrl = text && (text === href || /^https?:\/\//.test(text) || text.startsWith('/'));
      if (txtIsUrl) text = '';
      return { href, text };
    }
    return { href: '', text: '' };
  };

  const extracted = extractAnchor(overlaySource);

  // CTA: prefer model value, then overlay-scope anchor, then any anchor in the block that isn't the video source
  let runtimeCta = modelOverlayCta || aueOverlayCta || (overlaySource && overlaySource.dataset && (overlaySource.dataset.cta || overlaySource.dataset.overlayCta)) || extracted.href || '';
  let runtimeCtaText = modelOverlayCtaText || aueOverlayCtaText || (overlaySource && overlaySource.dataset && (overlaySource.dataset.ctatext || overlaySource.dataset.overlayCtatext)) || extracted.text || '';
  const runtimeText = modelOverlayText || aueOverlayText || (overlaySource && overlaySource.dataset && overlaySource.dataset.text) || '';

  if (!runtimeCta) {
    // find any anchor captured earlier in the block that doesn't match the video link/source
    for (let i = 0; i < preAnchors.length; i++) {
      const a = preAnchors[i];
      const href = a.getAttribute('href') || '';
      if (!href) continue;
      if (href === link || href.includes('asset_video_manifest') || href.includes('youtube') || href.includes('v=')) continue;
      runtimeCta = runtimeCta || href;
      runtimeCtaText = runtimeCtaText || (a.textContent && a.textContent.trim()) || runtimeCtaText;
      if (runtimeCta) break;
    }
  }

  // position: prefer explicit aue value if present
  const runtimePosition = modelOverlayPosition || aueOverlayPosition || (overlaySource && overlaySource.dataset && (overlaySource.dataset.position || overlaySource.dataset.overlayPosition)) || '';

  // always create overlay container (use provided content or default design)
  block.classList.add('has-overlay');
  // add position class to block for CSS modifiers; normalize to known values
  const pos = (runtimePosition || 'center').replace(/ /g, '-');
  block.classList.add(`position-${pos}`);

  const overlay = document.createElement('div');
  overlay.className = 'video-overlay';
  const content = document.createElement('div');
  content.className = 'overlay-content';

  if (overlayHTML) {
    // If authored overlay contains AEM model nodes, convert them to our styled structure
    const aueTitleNode = overlaySource && overlaySource.querySelector('[data-aue-prop="overlayText"]');
    const aueCtaNode = overlaySource && (overlaySource.querySelector('[data-aue-prop="overlayCtaUrl"]') || overlaySource.querySelector('a'));
    if (aueTitleNode) {
      const title = document.createElement('h1');
      title.className = 'overlay-title';
      title.textContent = aueTitleNode.textContent.trim();
      try { title.style.setProperty('font-size', '56pt', 'important'); } catch (e) { title.style.fontSize = '56pt'; }
      content.appendChild(title);
      // subtitle if present in authored HTML
      const subtitleNode = overlaySource.querySelector('[data-aue-prop="overlaySubtitle"]');
      if (subtitleNode) {
        const subtitle = document.createElement('p');
        subtitle.className = 'overlay-subtitle';
        subtitle.textContent = subtitleNode.textContent.trim();
        content.appendChild(subtitle);
      }
      // append CTA if available
      if (runtimeCta || (aueCtaNode && aueCtaNode.getAttribute)) {
        const cta = document.createElement('a');
        cta.className = 'overlay-cta';
        cta.href = runtimeCta || (aueCtaNode.getAttribute && aueCtaNode.getAttribute('href')) || '#';
        cta.textContent = (runtimeCtaText && !(runtimeCtaText === runtimeCta || /^https?:\/\//.test(runtimeCtaText) || runtimeCtaText.startsWith('/'))) ? runtimeCtaText : (aueCtaNode && aueCtaNode.textContent && aueCtaNode.textContent.trim() && aueCtaNode.textContent.trim() !== cta.href ? aueCtaNode.textContent.trim() : 'Shop Gifts');
        content.appendChild(cta);
      }
    } else {
      // fallback: inject the raw authored HTML but ensure CTA is present
      content.innerHTML = overlayHTML;
      const hasCtaInHtml = !!content.querySelector('.overlay-cta') || !!content.querySelector('a');
      if (!hasCtaInHtml && runtimeCta) {
        const cta = document.createElement('a');
        cta.className = 'overlay-cta';
        cta.href = runtimeCta;
        cta.textContent = (runtimeCtaText && !(runtimeCtaText === runtimeCta || /^https?:\/\//.test(runtimeCtaText) || runtimeCtaText.startsWith('/'))) ? runtimeCtaText : 'Shop Gifts';
        content.appendChild(cta);
      }
    }
  } else if (runtimeText) {
    // if model provided a single overlay text string, use it as the title
    const title = document.createElement('h1');
    title.className = 'overlay-title';
    title.textContent = runtimeText;
    // force requested font-size to avoid external overrides
    try {
      title.style.setProperty('font-size', '56pt', 'important');
    } catch (e) {
      title.style.fontSize = '56pt';
    }
    content.appendChild(title);
    // optional CTA from model
    if (runtimeCta) {
      const cta = document.createElement('a');
      cta.className = 'overlay-cta';
      cta.href = runtimeCta;
      cta.textContent = (runtimeCtaText && !(runtimeCtaText === runtimeCta || /^https?:\/\//.test(runtimeCtaText) || runtimeCtaText.startsWith('/'))) ? runtimeCtaText : 'Shop Gifts';
      content.appendChild(cta);
    }
  } else {
    // Default markup matching provided design image
    const title = document.createElement('h1');
    title.className = 'overlay-title';
    title.textContent = 'GYM-READY GIFTS';
    try {
      title.style.setProperty('font-size', '56pt', 'important');
    } catch (e) {
      title.style.fontSize = '56pt';
    }

    const subtitle = document.createElement('p');
    subtitle.className = 'overlay-subtitle';
    subtitle.textContent = 'Fuel their routine with the best workout styles.';

    const cta = document.createElement('a');
    cta.className = 'overlay-cta';
    // use runtime CTA URL and CTA Text if provided, otherwise fallback to model default or '#'
    cta.href = runtimeCta || '#';
    cta.textContent = runtimeCtaText || 'Shop Gifts';

    const dots = document.createElement('div');
    dots.className = 'overlay-dots';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dots.appendChild(dot);
    }

    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(cta);
    content.appendChild(dots);
  }

  overlay.appendChild(content);
  block.appendChild(overlay);

  // HARD OVERRIDE: only replace CTA text when an explicit model (`data-overlay-cta-text`) or
  // AEM `data-aue-prop="overlayCtaText"` value is present. Ignore generic buttons elsewhere.
  const preferredCtaLabel = modelOverlayCtaText || aueOverlayCtaText || '';
  if (preferredCtaLabel) {
    if (!(preferredCtaLabel === runtimeCta || /^https?:\/\//.test(preferredCtaLabel) || preferredCtaLabel.startsWith('/'))) {
      const ctaEl = block.querySelector('.overlay-cta');
      if (ctaEl) ctaEl.textContent = preferredCtaLabel;
    }
  }
}
