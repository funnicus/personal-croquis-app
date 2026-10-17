import type { Node } from '@xyflow/svelte';

export type ImageNode = Node<{ imageId: number; imageName: string }, 'image'>;
export type LibraryImage = { id: number; name: string };
export const IMAGE_DRAG_TYPE = 'application/x-croquis-image';
