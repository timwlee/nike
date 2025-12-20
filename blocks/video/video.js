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
  const linkEl = block.querySelector(':scope div:nth-child(1) > div a');
  if (!linkEl) return;
  const link = linkEl.innerHTML.trim();
  console.log('link', link);

  // capture optional overlay content before clearing block
  const overlaySource = block.querySelector(':scope div:nth-child(2)');
  const overlayHTML = overlaySource ? overlaySource.innerHTML.trim() : '';

  // read model-driven values if rendered as data attributes on the block
  const modelOverlayText = (block.dataset && block.dataset.overlayText) || '';
  const modelOverlayCta = (block.dataset && block.dataset.overlayCtaUrl) || '';
  const modelOverlayPosition = (block.dataset && block.dataset.overlayPosition) || '';

  block.textContent = '';
  block.dataset.embedLoaded = false;

  // force autoplay, loop and hide controls for this block
  loadVideoEmbed(block, link, true, true);

  // determine optional runtime config from model data attributes or overlay source
  const runtimePosition = modelOverlayPosition || (overlaySource && overlaySource.dataset && overlaySource.dataset.position) || '';
  const runtimeCta = modelOverlayCta || (overlaySource && overlaySource.dataset && overlaySource.dataset.cta) || '';
  const runtimeText = modelOverlayText || '';

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
    content.innerHTML = overlayHTML;
  } else if (runtimeText) {
    // if model provided a single overlay text string, use it as the title
    const title = document.createElement('h1');
    title.className = 'overlay-title';
    title.textContent = runtimeText;
    content.appendChild(title);
    // optional CTA from model
    if (runtimeCta) {
      const cta = document.createElement('a');
      cta.className = 'overlay-cta';
      cta.href = runtimeCta;
      cta.textContent = 'Shop Gifts';
      content.appendChild(cta);
    }
  } else {
    // Default markup matching provided design image
    const title = document.createElement('h1');
    title.className = 'overlay-title';
    title.textContent = 'GYM-READY GIFTS';

    const subtitle = document.createElement('p');
    subtitle.className = 'overlay-subtitle';
    subtitle.textContent = 'Fuel their routine with the best workout styles.';

    const cta = document.createElement('a');
    cta.className = 'overlay-cta';
    // use runtime CTA if provided, otherwise default to '#'
    cta.href = runtimeCta || '#';
    cta.textContent = 'Shop Gifts';

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
}
