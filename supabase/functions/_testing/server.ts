export let lastHandler: ((request: Request) => Response | Promise<Response>) | undefined;
export function serve(handler: (request: Request) => Response | Promise<Response>): void {
  lastHandler = handler;
}
