import { DOKVS } from "../src/cfobj.ts";
export { DOKVS };

export default {
  fetch() {
    return new Response(`OK ${DOKVS.now()}`);
  },
};

export class DurableObject<Env = unknown> {}
