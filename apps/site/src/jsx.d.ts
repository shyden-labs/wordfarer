/**
 * Astro types a template's JSX element as `HTMLElement | any`, to admit other
 * frameworks' JSX; the site uses none, and the `any` fails typed linting
 * (`no-unsafe-return` on every `.map()` in a template). This narrows it, as
 * eslint-plugin-astro's README prescribes ("Resolving Error in JSX").
 */
import 'astro/astro-jsx';

declare global {
  namespace JSX {
    type Element = HTMLElement;
  }
}
