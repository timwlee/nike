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

/** Render CTA Content Fragment(s) **/
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
        tag,
      });
      return;
    }

    const offer = await response.json();
    const items = offer?.data?.ctaList?.items;

    if (!Array.isArray(items) || !items.length) {
      console.warn(`No CTA items returned for tag: ${tag}`);
      return;
    }

    for (const item of items) {
      const itemId = item?._path
        ? `urn:aemconnection:${item._path}`
        : `urn:aemconnection:${contentPath}/jcr:content/data/${variationName}`;

      const imgUrl = isAuthor
        ? item.bannerimage?._authorUrl
        : item.bannerimage?._publishUrl;

      const bannerDetailStyle = `
        background-image:
          linear-gradient(90deg, rgba(0,0,0,0.6), rgba(0,0,0,0.1) 80%),
          url(${imgUrl});
      `;

      let ctaHref = resolveCtaHref(
        item?.ctaurl,
        isAuthor,
        aemauthorurl,
        aempublishurl,
      );

      if (!isAuthor) {
        ctaHref = await mapPublishPath(ctaHref);
      }

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

            <h2 data-aue-prop="title" data-aue-type="text" class="cftitle">
              ${item?.title || ''}
            </h2>

            <h3 data-aue-prop="subtitle" data-aue-type="text" class="cfsubtitle">
              ${item?.subtitle || ''}
            </h3>

            <div data-aue-prop="description" data-aue-type="richtext" class="cfdescription">
              <p>${item?.description?.plaintext || ''}</p>
            </div>

            <p class="button-container ${ctaStyle}">
              <a href="${ctaHref}" target="_blank" rel="noopener" class="button"
                data-aue-prop="ctaurl" data-aue-type="reference">
                <span data-aue-prop="ctalabel" data-aue-type="text">
                  ${item?.ctalabel || ''}
                </span>
              </a>
            </p>
          </div>

          <div class="banner-logo"></div>
        </div>
        `,
      );
    }
  } catch (error) {
    console.error('Error rendering CTA content fragments', error);
  }
}

/** Init **/
export default async function decorate(block) {
  const CONFIG = {
    WRAPPER_SERVICE_URL:
      'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf',
    GRAPHQL_QUERY: '/graphql/execute.json/ref-demo-eds/CTAListByTag',
  };

  const hostnameFromPlaceholders = await getHostname();
  const hostname = hostnameFromPlaceholders || getMetadata('hostname');

  const aemauthorurl = getMetadata('authorurl') || '';
  const aempublishurl = hostname
    ?.replace('author', 'publish')
    ?.replace(/\/$/, '');

  const contentPath = '#';
  const variationName = 'master';

  const displayStyle =
    block.querySelector(':scope div:nth-child(2) > div')?.textContent?.trim() || '';

  const alignment =
    block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';

  const ctaStyle =
    block.querySelector(':scope div:nth-child(4) > div')?.textContent?.trim() || 'button';

  const tagsList =
    block.querySelector(':scope div:nth-child(1) > div')?.textContent?.trim() || '';

  const tags = tagsList
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  block.innerHTML = '';
  const isAuthor = isAuthorEnvironment();

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
