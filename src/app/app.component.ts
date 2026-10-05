import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import { GraphqlQueryBuilderComponent } from './graphql-query-builder/public-api';
import { GraphqlQueryPayload } from './graphql-query-builder/models/graphql-query.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, GraphqlQueryBuilderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly demoEndpoint = 'https://countries.trevorblades.com/graphql';

  lastSubmitted: GraphqlQueryPayload | null = null;

  onSubmit(payload: GraphqlQueryPayload): void {
    this.lastSubmitted = payload;
  }
}
