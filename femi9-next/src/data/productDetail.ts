export interface ProductExtra {
  gallery: string[]
  rating: number
  reviews: number
  long: string
  features: { title: string; body: string }[]
  specs: { k: string; v: string }[]
}

/**
 * Only the TYPE survives here. The `EXTRAS` map and the `sampleReviews` array
 * that used to live below were hardcoded copies of catalog data — every product
 * page now resolves its gallery, rating, long copy, features, specs and reviews
 * from the database through `services/products.ts`, so a shipped fixture could
 * only ever disagree with what the admin console had published.
 */
