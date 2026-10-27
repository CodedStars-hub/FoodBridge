# FoodBridge public-site assets

Downloaded 27 October 2026 and self-hosted; the site does not request stock image or font servers at runtime. These are illustrative food photographs, not FoodBridge activity, partners or endorsements. Cropped and resized to 480/960/1440px WebP with metadata removed.

| Local image family | Creator            | Source                                                                                             |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| harvest            | Antonius Ferret    | https://www.pexels.com/photo/hands-of-persons-holding-fresh-vegetables-in-a-woven-basket-6223211/  |
| basket             | RDNE Stock project | https://www.pexels.com/photo/a-close-up-shot-of-a-person-arranging-vegetables-in-a-basket-8540212/ |
| shared-table       | Ella Olsson        | https://www.pexels.com/photo/variety-of-vegetables-in-the-bowl-1640777/                            |

Images downloaded from the corresponding images.pexels.com/photos/<photo-id>/pexels-photo-<photo-id>.jpeg sources. Licensed under the [Pexels license](https://www.pexels.com/license/), which permits website use and modification without mandatory attribution. No endorsement is implied; no image is used as a logo or sold as an unaltered copy.

Fonts: DM Sans and Fraunces, downloaded through Google Fonts and self-hosted as WOFF2. Both use the SIL Open Font License 1.1; complete notices are retained in `fonts/dmsans-OFL.txt` and `fonts/fraunces-OFL.txt`. Sources: https://github.com/google/fonts/tree/main/ofl/dmsans and https://github.com/google/fonts/tree/main/ofl/fraunces. CSS family names are scoped aliases; original font names/notices remain in the font assets. The existing application fonts are unchanged.

Decorative branch illustrations are original inline SVG in LandingPage.jsx. Interface icons use the application's existing lucide-react dependency and license.

Phase 2 browser icon: favicon.svg is an original code-drawn sprout/arched-frame mark using the FoodBridge palette; favicon.ico is a 48px PNG-containing ICO derivative of that vector. It prevents the browser’s default favicon request from returning 404. No external logo or endorsement is used.
