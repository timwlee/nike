import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment } from '../../scripts/scripts.js';
import { getHostname, mapAemPathToSitePath } from '../../scripts/utils.js';

/** Helper Functions **/
const jsonHeaders = { 'Content-Type': 'application/json' };

function logAndClear(block, message, context = {}) {
  console.error(message, context);
  block.innerHTML = '';
}

function buildRequestConfig({
  isAuthor,
  tag,
  contentPath,
  variationName,
  aemauthorurl,
  aempublishurl,
  CONFIG,
}) {
  const ts = Date.now();

  if (isAuthor) {
    return {
      url: `${aemauthorurl}${CONFIG.GRAPHQL_QUERY};tag=${tag};ts=${ts}`,
      options: {
        method: 'GET',
        headers: jsonHeaders,
      },
    };
  }

  return {
    url: CONFIG.WRAPPER_SERVICE_URL,
    options: {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        graphQLPath: `${aempublishurl}${CONFIG.GRAPHQL_QUERY};tag=${tag};ts=${ts}`,
        cfPath: contentPath,
        variation: `${variationName};ts=${ts}`,
      }),
    },
  };
}

function resolveCtaHref(cta, isAuthor, aemauthorurl, aempublishurl) {
  if (!cta) return '#';

  if (typeof cta === 'string') {
    return /^https?:\/\//i.test(cta)
      ? cta
      : `${isAuthor ? aemauthorurl : aempublishurl}${cta}`;
  }

  if (typeof cta === 'object') {
    if (isAuthor) {
      return (
        cta._authorUrl ||
        (cta._path ? `${aemauthorurl}${cta._path}` : '#')
      );
    }
    return cta._path || '#';
  }

  return '#';
}

async function mapPublishPath(ctaHref) {
  try {
    let candidate = ctaHref;

    if (/^https?:\/\//i.test(candidate)) {
      candidate = new URL(candidate).pathname;
    }

    if (candidate?.startsWith('/content/')) {
      const mapped = await mapAemPathToSitePath(candidate);
      return mapped || ctaHref;
    }
  } catch (e) {
    console.warn('Failed to map CTA via paths.json', e);
  }

  return ctaHref;
}

/** Render CTA Content Fragment **/
async function renderCTAByTag(
  block,
  tag,
  isAuthor,
  contentPath,
  variationName,
  displayStyle,
  alignment,
  ctaStyle,
  aemauthorurl,
  aempublishurl,
  CONFIG,
) {
  if (!tag) {
    console.warn('Skipping CTA render: empty tag value');
    return;
  }

  console.log(
    `Rendering CTA for tag: ${tag} in ${isAuthor ? 'author' : 'publish'} environment`,
  );

  try {
    const { url, options } = buildRequestConfig({
      isAuthor,
      tag,
      contentPath,
      variationName,
      aemauthorurl,
      aempublishurl,
      CONFIG,
    });

    const response = await fetch(url, options);

    if (!response.ok) {
      logAndClear(block, 'Error making CF GraphQL request', {
        status: response.status,
        contentPath,
        variationName,
        isAuthor,
      });
      return;
    }

    let offer;
    try {
      offer = await response.json();
    } catch (err) {
      logAndClear(block, 'Error parsing offer JSON from response', {
        error: err.message,
        contentPath,
        variationName,
        isAuthor,
      });
      return;
    }

    const cfReq = offer?.data?.ctaList?.items?.[0];

    if (!cfReq) {
      logAndClear(block, 'No valid CTA data found in GraphQL response', {
        response: offer,
        contentPath,
        variationName,
      });
      return;
    }

    const itemId = `urn:aemconnection:${contentPath}/jcr:content/data/${variationName}`;
    const imgUrl = isAuthor
      ? cfReq.bannerimage?._authorUrl
      : cfReq.bannerimage?._publishUrl;

    const bannerDetailStyle = `background-image: linear-gradient(90deg,rgba(0,0,0,0.6), rgba(0,0,0,0.1) 80%), url(${imgUrl});`;

    let ctaHref = resolveCtaHref(
      cfReq?.ctaurl,
      isAuthor,
      aemauthorurl,
      aempublishurl,
    );

    if (!isAuthor) {
      ctaHref = await mapPublishPath(ctaHref);
    }

    block.setAttribute('data-aue-type', 'container');

    block.insertAdjacentHTML(
      'beforeend',
      `
      <div class="banner-content ${displayStyle} block"
        data-aue-resource="${itemId}"
        data-aue-label="${variationName || 'Elements'}"
        data-aue-type="reference"
        data-aue-filter="contentfragment">

        <div class="banner-detail ${alignment}"
          style="${bannerDetailStyle}"
          data-aue-prop="bannerimage"
          data-aue-label="Main Image"
          data-aue-type="media">

          <h2 data-aue-prop="title" data-aue-label="Title" data-aue-type="text" class="cftitle">
            ${cfReq?.title || ''}
          </h2>

          <h3 data-aue-prop="subtitle" data-aue-label="SubTitle" data-aue-type="text" class="cfsubtitle">
            ${cfReq?.subtitle || ''}
          </h3>

          <div data-aue-prop="description" data-aue-label="Description" data-aue-type="richtext" class="cfdescription">
            <p>${cfReq?.description?.plaintext || ''}</p>
          </div>

          <p class="button-container ${ctaStyle}">
            <a href="${ctaHref}"
              target="_blank"
              rel="noopener"
              class="button"
              data-aue-prop="ctaurl"
              data-aue-label="Button Link/URL"
              data-aue-type="reference"
              data-aue-filter="page">

              <span data-aue-prop="ctalabel" data-aue-label="Button Label" data-aue-type="text">
                ${cfReq?.ctalabel || ''}
              </span>
            </a>
          </p>
        </div>

        <div class="banner-logo"></div>
      </div>
    `,
    );
  } catch (error) {
    console.error('Error rendering content fragment:', {
      error: error.message,
      stack: error.stack,
      contentPath,
      variationName,
      isAuthor,
    });
  }
}

/** Init **/

export default async function decorate(block) {
  const CONFIG = {
    WRAPPER_SERVICE_URL:
      'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf',
    GRAPHQL_QUERY: '/graphql/execute.json/ref-demo-eds/CTAListByTag',
    EXCLUDED_THEME_KEYS: new Set(['brandSite', 'brandLogo']),
  };

  const hostnameFromPlaceholders = await getHostname();
  const hostname = hostnameFromPlaceholders || getMetadata('hostname');

  const aemauthorurl = getMetadata('authorurl') || '';
  const aempublishurl = hostname
    ?.replace('author', 'publish')
    ?.replace(/\/$/, '');

  const contentPath = '/content/dam/nike/en/fragments/dynamic-cta-list'; /** Update accordingly **/
  const variationName = 'master'; /** Default to 'master' **/
  const displayStyle = block.querySelector(':scope div:nth-child(2) > div')?.textContent?.trim() || '';
	const alignment = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';
  const ctaStyle = block.querySelector(':scope div:nth-child(4) > div')?.textContent?.trim() || 'button';

  const tagsList =
    block.querySelector(':scope div:nth-child(1) > div')?.textContent?.trim() ||
    '';

  const tags = tagsList
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  block.innerHTML = '';
  const isAuthor = isAuthorEnvironment();

  /** no tags → no fetch */
  if (!tags.length) {
    console.warn('Dynamic CTA List: No tags provided. Skipping GraphQL request.');
    return;
  }

  await Promise.all(
    tags.map((tag) =>
      renderCTAByTag(
        block,
        tag,
        isAuthor,
        contentPath,
        variationName,
        displayStyle,
        alignment,
        ctaStyle,
        aemauthorurl,
        aempublishurl,
        CONFIG,
      ),
    ),
  );
}