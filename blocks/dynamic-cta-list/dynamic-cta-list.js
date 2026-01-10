import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment, moveInstrumentation } from '../../scripts/scripts.js';
import { getHostname, mapAemPathToSitePath } from '../../scripts/utils.js';
import { readBlockConfig } from '../../scripts/aem.js';

/**
 *
 * @param {Element} block
 */

async function renderCTAByTag(block, tag, isAuthor, contentPath, variationname, aemauthorurl, aempublishurl, CONFIG) {
  console.log(`Rendering CTA for tag: ${tag} in ${isAuthor ? 'author' : 'publish'} environment`);

  	// Prepare request configuration based on environment
	const requestConfig = isAuthor 
  ? {
      url: `${aemauthorurl}${CONFIG.GRAPHQL_QUERY};ts=${Date.now()}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }
  : {
      url: `${CONFIG.WRAPPER_SERVICE_URL}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graphQLPath: `${aempublishurl}${CONFIG.GRAPHQL_QUERY};tag=${tag};ts=${Date.now()}`,
        cfPath: contentPath,
        variation: `${variationname};ts=${Date.now()}`
      })
    };

    try {
        // Fetch data
        const response = await fetch(requestConfig.url, {
          method: requestConfig.method,
          headers: requestConfig.headers,
          ...(requestConfig.body && { body: requestConfig.body })
        });

        if (!response.ok) {
					console.error(`error making cf graphql request:${response.status}`, {
	          error: error.message,
	          stack: error.stack,
	          contentPath,
	          variationname,
	          isAuthor
        	});
          block.innerHTML = '';
          return; // Exit early if response is not ok
        } 

        let offer;
        try {
          offer = await response.json();
        } catch (parseError) {
					console.error('Error parsing offer JSON from response:', {
	          error: error.message,
	          stack: error.stack,
	          contentPath,
	          variationname,
	          isAuthor
        	});
          block.innerHTML = '';
          return;
        }

        // LOCAL DEVELOPMENT TESTING ONLY
        // const cfReq = {"title":"College Football","subtitle":"Nike gear for your favorite teams","description":{"plaintext":"Shop the latest college football gear this season"},"__typename":"CtaModel","_model":{"_path":"/conf/ref-demo-eds/settings/dam/cfm/models/cta","_id":null,"title":"CTA"},"_variation":"master","bannerimage":{"_authorUrl":"https://author-p178552-e1883614.adobeaemcloud.com/content/dam/nike/en/category/offers/imgi_22_nike-just-do-it.jpg","_publishUrl":"https://publish-p178552-e1883614.adobeaemcloud.com/content/dam/nike/en/category/offers/imgi_22_nike-just-do-it.jpg","_smartCrops":[{"name":"Swatch"},{"name":"54vert"},{"name":"169banner"},{"name":"11square"}],"_dmS7Url":"https://s7d1.scene7.com/is/image/Cherneff/imgi_22_nike-just-do-it-1","_dynamicUrl":"/adobe/dynamicmedia/deliver/dm-aid--dd50df2e-ab6f-4a85-a4f9-b9d1c2242f45/imgi_22_nike_just_do_it.jpg"},"_path":"/content/dam/nike/en/fragments/fragment-four-category","ctalabel":"Shop Football","ctaurl":{"_path":"/content/nike/language-masters/en","_authorUrl":"https://author-p178552-e1883614.adobeaemcloud.com/content/nike/language-masters/en.html"},"_tags":["nike:sports/football"]};
        const cfReq = offer?.data?.ctaByPath?.items[0];

        if (!cfReq) {
          console.error('Error parsing response from GraphQL request - no valid data found', {
            response: offer,
            contentPath,
            variationname
          });
          block.innerHTML = '';
          return; // Exit early if no valid data
        }
        // Set up block attributes
        const itemId = `urn:aemconnection:${contentPath}/jcr:content/data/${variationname}`;
        block.setAttribute('data-aue-type', 'container');
        const imgUrl = isAuthor ? cfReq.bannerimage?._authorUrl : cfReq.bannerimage?._publishUrl;

        // Determine the layout style
        // const isImageLeft = displayStyle === 'image-left';
        // const isImageRight = displayStyle === 'image-right';
        // const isImageTop = displayStyle === 'image-top';
        // const isImageBottom = displayStyle === 'image-bottom';
        
        
        // Set background image and styles based on layout
        let bannerContentStyle = '';
        let bannerDetailStyle = '';
        
        // if (isImageLeft) {
        //   // Image-left layout: image on left, text on right
        //   bannerContentStyle = 'background-image: url('+imgUrl+');';
        // } else if (isImageRight) {
        //   // Image-right layout: image on right, text on left
        //   bannerContentStyle = 'background-image: url('+imgUrl+');';
        // } else if (isImageTop) {
        //   // Image-top layout: image on top, text on bottom
        //   bannerContentStyle = 'background-image: url('+imgUrl+');';
        // } else if (isImageBottom) {
        //   // Image-bottom layout: text on top, image on bottom
        //   bannerContentStyle = 'background-image: url('+imgUrl+');';
        // }  else {
          // Default layout: image as background with gradient overlay (original behavior)
          bannerDetailStyle = 'background-image: linear-gradient(90deg,rgba(0,0,0,0.6), rgba(0,0,0,0.1) 80%) ,url('+imgUrl+');';
        // }

        // Derive CTA href: supports author-side paths/URLs and publish/EDS URLs
        let ctaHref = '#';
        const cta = cfReq?.ctaurl;
        if (cta) {
          if (typeof cta === 'string') {
            // Absolute URL vs repository path
            ctaHref = /^https?:\/\//i.test(cta) ? cta : `${isAuthor ? (aemauthorurl || '') : (aempublishurl || '')}${cta}`;
          } else if (typeof cta === 'object') {
            const authorUrl = cta._authorUrl;
            const publishUrl = cta._publishUrl || cta._url;
            const pathOnly = cta._path;
            if (isAuthor) {
              ctaHref = authorUrl || (pathOnly ? `${aemauthorurl || ''}${pathOnly}` : '#');
            } else {
              ctaHref = pathOnly;
            }
          }
        }

        // Map content paths to site-relative paths using paths.json on live
        if (!isAuthor) {
          try {
            let candidate = ctaHref;
            if (/^https?:\/\//i.test(candidate)) {
              const u = new URL(candidate);
              candidate = u.pathname;
            }
            if (candidate && candidate.startsWith('/content/')) {
              const mapped = await mapAemPathToSitePath(candidate);
              if (mapped) ctaHref = mapped;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Failed to map CTA via paths.json', e);
          }
        }

      block.insertAdjacentHTML( 'beforeend',
       `<div class='banner-content nike-cf-style block' data-aue-resource=${itemId} data-aue-label=${variationname ||"Elements"} data-aue-type="reference" data-aue-filter="contentfragment" style="${bannerContentStyle}">
          <div class='banner-detail text-left' style="${bannerDetailStyle}" data-aue-prop="bannerimage" data-aue-label="Main Image" data-aue-type="media" >
                <h2 data-aue-prop="title" data-aue-label="Title" data-aue-type="text" class='cftitle'>${cfReq?.title}</h2>
                <h3 data-aue-prop="subtitle" data-aue-label="SubTitle" data-aue-type="text" class='cfsubtitle'>${cfReq?.subtitle}</h3>
                
                <div data-aue-prop="description" data-aue-label="Description" data-aue-type="richtext" class='cfdescription'><p>${cfReq?.description?.plaintext || ''}</p></div>
                 <p class="button-container">
                  <a href="${ctaHref}" data-aue-prop="ctaurl" data-aue-label="Button Link/URL" data-aue-type="reference"  target="_blank" rel="noopener" data-aue-filter="page" class='button'>
                    <span data-aue-prop="ctalabel" data-aue-label="Button Label" data-aue-type="text">
                      ${cfReq?.ctalabel}
                    </span>
                  </a>
                </p>
            </div>
            <div class='banner-logo'>
            </div>
        </div>`);
        
    
      } catch (error) {
        console.error('Error rendering content fragment:', {
          error: error.message,
          stack: error.stack,
          contentPath,
          variationname,
          isAuthor
        });
        block.innerHTML = '';
      }
}


export default async function decorate(block) {
  console.log('Dynamic CTA List Block - Start rendering: ', block);
	// Configuration
  const CONFIG = {
    WRAPPER_SERVICE_URL: 'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf',
    GRAPHQL_QUERY: '/graphql/execute.json/ref-demo-eds/CTAListByTag',
    EXCLUDED_THEME_KEYS: new Set(['brandSite', 'brandLogo'])
  };
	
  const hostnameFromPlaceholders = await getHostname();
	const hostname = hostnameFromPlaceholders ? hostnameFromPlaceholders : getMetadata('hostname');
  const aemauthorurl = getMetadata('authorurl') || '';
	
  const aempublishurl = hostname?.replace('author', 'publish')?.replace(/\/$/, '');  
	
	//const aempublishurl = getMetadata('publishurl') || '';
	
  const persistedquery = '/graphql/execute.json/ref-demo-eds/CTAListByTag';

	//const properties = readBlockConfig(block);
 
	
  const contentPath = '/content/dam/nike/en/fragments/dynamic-cta-list';
  const variationname = 'master';
	
	//console.log("variation : "+properties.variation);
	//let variationname = properties.variation ? properties.variation : 'master';
	
	// const variationname = block.querySelector(':scope div:nth-child(2) > div')?.textContent?.trim()?.toLowerCase()?.replace(' ', '_') || 'master';
	// const displayStyle = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';
	// const alignment = block.querySelector(':scope div:nth-child(4) > div')?.textContent?.trim() || '';
  // const ctaStyle = block.querySelector(':scope div:nth-child(5) > div')?.textContent?.trim() || 'button';

  const tagsList = block.querySelector(':scope div:nth-child(1) > div')?.textContent?.trim();
  const tags = tagsList.split(',') || [];

  block.innerHTML = '';
  const isAuthor = isAuthorEnvironment();

  tags.forEach(async (tag) => {
    await renderCTAByTag(block, tag.trim(), isAuthor, contentPath, variationname, aemauthorurl, aempublishurl, CONFIG);
  });

	/*
  if (!isAuthor) {
    moveInstrumentation(block, null);
    block.querySelectorAll('*').forEach((elem) => moveInstrumentation(elem, null));
  }
	*/
}
