import { getStore } from '@netlify/blobs'

export function getReviewStore() {
  const siteID =
    (typeof Netlify !== 'undefined' && Netlify.env ? Netlify.env.get('NETLIFY_SITE_ID') : undefined) ||
    process.env.NETLIFY_SITE_ID
  const token =
    (typeof Netlify !== 'undefined' && Netlify.env ? Netlify.env.get('NETLIFY_AUTH_TOKEN') : undefined) ||
    process.env.NETLIFY_AUTH_TOKEN

  const options = {
    name: 'reviews',
    consistency: 'strong' as const,
  }

  if (siteID && token) {
    return getStore({ ...options, siteID, token })
  }

  return getStore(options)
}
