import { listBoards } from '$lib/server/moodboard-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ boards: await listBoards() });
