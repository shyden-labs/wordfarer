import { mount } from 'svelte';
import { Shell } from '@yawelo-idle/ui';

const target = document.getElementById('app');
if (target === null) {
  throw new Error('index.html has no #app element to mount into');
}

export default mount(Shell, { target });
