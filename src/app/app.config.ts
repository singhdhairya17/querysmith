import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../environments/environment';
import { GRAPHQL_HTTP_GATEWAY } from './graphql-query-builder/graphql-http-gateway.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    {
      provide: GRAPHQL_HTTP_GATEWAY,
      useValue: environment.graphqlHttpGateway,
    },
  ],
};
