import { getMetadata } from '../../scripts/aem.js';
import { isAuthorEnvironment, moveInstrumentation } from '../../scripts/scripts.js';
import { getHostname, mapAemPathToSitePath } from '../../scripts/utils.js';
import { readBlockConfig } from '../../scripts/aem.js';

/**
 *
 * @param {Element} block
 */
export default async function decorate(block) {
	// Configuration
  const CONFIG = {
    WRAPPER_SERVICE_URL: 'https://3635370-refdemoapigateway-stage.adobeioruntime.net/api/v1/web/ref-demo-api-gateway/fetch-cf',
    GRAPHQL_QUERY: '/graphql/execute.json/ref-demo-eds/CTAByPath',
    GRAPHQL_QUERY_CTALISTBYPATH: '/graphql/execute.json/ref-demo-eds/DynamicCTAListByPath',
    GRAPHQL_QUERY_CTALISTBYTAG: '/graphql/execute.json/ref-demo-eds/CTAListByTag',
    EXCLUDED_THEME_KEYS: new Set(['brandSite', 'brandLogo'])
  };
	
  const hostnameFromPlaceholders = await getHostname();
	const hostname = hostnameFromPlaceholders ? hostnameFromPlaceholders : getMetadata('hostname');
  const aemauthorurl = getMetadata('authorurl') || '';	
  const aempublishurl = hostname?.replace('author', 'publish')?.replace(/\/$/, '');  

	
	//const aempublishurl = getMetadata('publishurl') || '';
	
  const persistedquery = '/graphql/execute.json/ref-demo-eds/CTAByPath';

	//const properties = readBlockConfig(block);
 
	
  const contentPath = block.querySelector(':scope div:nth-child(1) > div a')?.textContent?.trim();
  //const variationname = block.querySelector(':scope div:nth-child(2) > div')?.textContent?.trim()?.toLowerCase()?.replace(' ', '_') || 'master';
	
	//console.log("variation : "+properties.variation);
	//let variationname = properties.variation ? properties.variation : 'master';
	
	const variationname = block.querySelector(':scope div:nth-child(2) > div')?.textContent?.trim()?.toLowerCase()?.replace(' ', '_') || 'master';
	const displayStyle = block.querySelector(':scope div:nth-child(3) > div')?.textContent?.trim() || '';
	const alignment = block.querySelector(':scope div:nth-child(4) > div')?.textContent?.trim() || '';
  const ctaStyle = block.querySelector(':scope div:nth-child(5) > div')?.textContent?.trim() || 'button';

  block.innerHTML = '';
  const isAuthor = isAuthorEnvironment();

	// Prepare request configuration based on environment
	const requestConfig = isAuthor 
  ? {
      url: `${aemauthorurl}${CONFIG.GRAPHQL_QUERY};path=${contentPath};variation=${variationname};ts=${Date.now()}`,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }
  : {
      url: `${CONFIG.WRAPPER_SERVICE_URL}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        graphQLPath: `${aempublishurl}${CONFIG.GRAPHQL_QUERY}`,
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

        const cfReq = offer?.data?.ctaByPath?.item;
        console.log("cfReq : ",cfReq);


        if (!cfReq) {
          console.error('Error parsing response from GraphQL request - no valid data found', {
            response: offer,
            contentPath,
            variationname
          });
          block.innerHTML = '';
          return; // Exit early if no valid data
        }

        // Check if the content fragment is of type 'Dynamic CTA List'
        const isDynamicCTAList = cfReq?._model?.title === 'Dynamic CTA List';

        // Render single content fragment if not a dynamic list
        if (!isDynamicCTAList) {
          // Set up block attributes
          const itemId = `urn:aemconnection:${contentPath}/jcr:content/data/${variationname}`;
          block.setAttribute('data-aue-type', 'container');
          const imgUrl = isAuthor ? cfReq.bannerimage?._authorUrl : cfReq.bannerimage?._publishUrl;

          // Determine the layout style
          const isImageLeft = displayStyle === 'image-left';
          const isImageRight = displayStyle === 'image-right';
          const isImageTop = displayStyle === 'image-top';
          const isImageBottom = displayStyle === 'image-bottom';
          
          
          // Set background image and styles based on layout
          let bannerContentStyle = '';
          let bannerDetailStyle = '';
          
          if (isImageLeft) {
            // Image-left layout: image on left, text on right
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageRight) {
            // Image-right layout: image on right, text on left
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageTop) {
            // Image-top layout: image on top, text on bottom
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageBottom) {
            // Image-bottom layout: text on top, image on bottom
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          }  else {
            // Default layout: image as background with gradient overlay (original behavior)
            bannerDetailStyle = 'background-image: linear-gradient(90deg,rgba(0,0,0,0.6), rgba(0,0,0,0.1) 80%) ,url('+imgUrl+');';
          }

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

        block.innerHTML = `<div class='banner-content block ${displayStyle}' data-aue-resource=${itemId} data-aue-label=${variationname ||"Elements"} data-aue-type="reference" data-aue-filter="contentfragment" style="${bannerContentStyle}">
            <div class='banner-detail ${alignment}' style="${bannerDetailStyle}" data-aue-prop="bannerimage" data-aue-label="Main Image" data-aue-type="media" >
                  <h2 data-aue-prop="title" data-aue-label="Title" data-aue-type="text" class='cftitle'>${cfReq?.title}</h2>
                  <h3 data-aue-prop="subtitle" data-aue-label="SubTitle" data-aue-type="text" class='cfsubtitle'>${cfReq?.subtitle}</h3>
                  
                  <div data-aue-prop="description" data-aue-label="Description" data-aue-type="richtext" class='cfdescription'><p>${cfReq?.description?.plaintext || ''}</p></div>
                  <p class="button-container ${ctaStyle}">
                    <a href="${ctaHref}" data-aue-prop="ctaurl" data-aue-label="Button Link/URL" data-aue-type="reference"  target="_blank" rel="noopener" data-aue-filter="page" class='button'>
                      <span data-aue-prop="ctalabel" data-aue-label="Button Label" data-aue-type="text">
                        ${cfReq?.ctalabel}
                      </span>
                    </a>
                  </p>
              </div>
              <div class='banner-logo'>
              </div>
          </div>`;
        } else {
        // If it is a dynamic CTA list, handle 
        const dynamicCTAListPath = cfReq?._path;
        const variationName = cfReq?._variation || 'master';

        // Here you would need to make another fetch call to 'GRAPHQL_QUERY_CTALISTBYPATH' to get the tags
        const listRequestConfig = isAuthor
          ? {
              url: `${aemauthorurl}${CONFIG.GRAPHQL_QUERY_CTALISTBYPATH};path=${dynamicCTAListPath};variation=${variationName};ts=${Date.now()};`,
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          : {
              url: CONFIG.WRAPPER_SERVICE_URL,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                graphQLPath: `${aempublishurl}${CONFIG.GRAPHQL_QUERY_CTALISTBYPATH}`,
                cfPath: dynamicCTAListPath,
                variation: `${variationName};ts=${Date.now()}`
              })
            };

        const listResponse = await fetch(listRequestConfig.url, {
          method: listRequestConfig.method,
          headers: listRequestConfig.headers,
          ...(listRequestConfig.body && { body: listRequestConfig.body })
        });

        if (!listResponse.ok) {
          console.error('Dynamic CTA list fetch failed');
          return;
        }

        const listData = await listResponse.json();
        const tags =
          listData?.data?.dynamicCtaListByPath?.item?.tags[0] || ""; //single tag for now

        console.log('Tags:', tags); // *** GOOOD UP TO HERE ****

        // Now fetch CTAs by tags using 'GRAPHQL_QUERY_CTALISTBYTAG'
        const ctaRequestConfig = isAuthor
          ? {
              url: `${aemauthorurl}${CONFIG.GRAPHQL_QUERY_CTALISTBYTAG};tag=${tags};ts=${Date.now()};`,
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            }
          : {
              url: CONFIG.WRAPPER_SERVICE_URL,
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                graphQLPath: `${aempublishurl}${CONFIG.GRAPHQL_QUERY_CTALISTBYTAG};tag=${tags}?ts=${Date.now()};`,
                cfPath: dynamicCTAListPath,
                variation: `${variationName};ts=${Date.now()}`,
              })
            };

        const ctaResponse = await fetch(ctaRequestConfig.url, {
          method: ctaRequestConfig.method,
          headers: ctaRequestConfig.headers,
          ...(ctaRequestConfig.body && { body: ctaRequestConfig.body })
        });

        if (!ctaResponse.ok) {
          console.error('Dynamic CTA fetch failed');
          return;
        }


        let ctaData = await ctaResponse.json(); 
        const ctas = ctaData?.data?.ctaList?.items || [];

        
        // FOR LOCAL DEVELOPMENT TESTING ONLY - REMOVE LATER
        // const nikeJSONResponse = await fetch('/blocks/content-fragment/nike.json');
        // const nikeJSON = await nikeJSONResponse.json();
        // const ctas = nikeJSON?.data?.ctaList?.items || [];


        console.log('CTAs:', ctas);

        // Render each CTA in the list
        for (const cfReq of ctas) {
          // Set up block attributes
          const itemId = `urn:aemconnection:${contentPath}/jcr:content/data/${variationname}`;
          const div = document.createElement('div');
          div.setAttribute('data-block-name', 'content-fragment');
          div.setAttribute('data-block-status', 'loaded');
          div.setAttribute('data-aue-type', 'container');
          div.className = 'content-fragment block';
          const imgUrl = isAuthor ? cfReq.bannerimage?._authorUrl : cfReq.bannerimage?._publishUrl;

          // Determine the layout style
          const isImageLeft = displayStyle === 'image-left';
          const isImageRight = displayStyle === 'image-right';
          const isImageTop = displayStyle === 'image-top';
          const isImageBottom = displayStyle === 'image-bottom';
          
          
          // Set background image and styles based on layout
          let bannerContentStyle = '';
          let bannerDetailStyle = '';
          
          if (isImageLeft) {
            // Image-left layout: image on left, text on right
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageRight) {
            // Image-right layout: image on right, text on left
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageTop) {
            // Image-top layout: image on top, text on bottom
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          } else if (isImageBottom) {
            // Image-bottom layout: text on top, image on bottom
            bannerContentStyle = 'background-image: url('+imgUrl+');';
          }  else {
            // Default layout: image as background with gradient overlay (original behavior)
            bannerDetailStyle = 'background-image: linear-gradient(90deg,rgba(0,0,0,0.6), rgba(0,0,0,0.1) 80%) ,url('+imgUrl+');';
          }

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

          div.innerHTML = `<div class='banner-content block ${displayStyle}' data-aue-resource=${itemId} data-aue-label=${variationname ||"Elements"} data-aue-type="reference" data-aue-filter="contentfragment" style="${bannerContentStyle}">
              <div class='banner-detail ${alignment}' style="${bannerDetailStyle}" data-aue-prop="bannerimage" data-aue-label="Main Image" data-aue-type="media" >
                    <h2 data-aue-prop="title" data-aue-label="Title" data-aue-type="text" class='cftitle'>${cfReq?.title}</h2>
                    <h3 data-aue-prop="subtitle" data-aue-label="SubTitle" data-aue-type="text" class='cfsubtitle'>${cfReq?.subtitle}</h3>
                    
                    <div data-aue-prop="description" data-aue-label="Description" data-aue-type="richtext" class='cfdescription'><p>${cfReq?.description?.plaintext || ''}</p></div>
                    <p class="button-container ${ctaStyle}">
                      <a href="${ctaHref}" data-aue-prop="ctaurl" data-aue-label="Button Link/URL" data-aue-type="reference"  target="_blank" rel="noopener" data-aue-filter="page" class='button'>
                        <span data-aue-prop="ctalabel" data-aue-label="Button Label" data-aue-type="text">
                          ${cfReq?.ctalabel}
                        </span>
                      </a>
                    </p>
                </div>
                <div class='banner-logo'>
                </div>
            </div>`;
        
          block.classList.add('dynamic-cta-list');
          block.appendChild(div);
        }

        // Render the list of CTAs using exactly the same HTML and logic From single CTA rendering logic
        }
    
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

	/*
  if (!isAuthor) {
    moveInstrumentation(block, null);
    block.querySelectorAll('*').forEach((elem) => moveInstrumentation(elem, null));
  }
	*/
}
