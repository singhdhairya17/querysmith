import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subscription, debounceTime, distinctUntilChanged, finalize } from 'rxjs';

import {
  GraphqlFieldNode,
  GraphqlMetadata,
  GraphqlObjectType,
} from '../models/graphql-metadata.model';
import {
  GraphqlQueryPayload,
  GraphqlTestResult,
} from '../models/graphql-query.model';
import { parseHttpHeadersJson } from '../graphql-http-headers.util';
import { parseGraphqlVariablesJson } from '../graphql-variables.util';
import { GraphqlMetadataService } from '../services/graphql-metadata.service';
import {
  GraphqlDocumentOperationKind,
  GraphqlQueryBuilderService,
} from '../services/graphql-query-builder.service';
import { GraphqlQueryValidatorService } from '../services/graphql-query-validator.service';
import { GraphqlArgumentEditorComponent } from './graphql-argument-editor.component';
import { GraphqlFieldTreeComponent } from './graphql-field-tree.component';

/**
 * Main composite component. Three panels:
 *
 *   1. Root objects panel: lists root query fields.
 *   2. Field tree panel:  shows fields/sub-fields of the selected
 *      root field with check-boxes.
 *   3. Editor panel:      shows generated query (editable),
 *      argument editor for the focused field, and test/submit
 *      buttons.
 */
@Component({
  selector: 'app-graphql-query-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    GraphqlFieldTreeComponent,
    GraphqlArgumentEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./graphql-query-builder.component.scss'],
  template: `
    <section class="gql-builder">
      <header class="gql-builder__header">
        <div class="gql-builder__header-top">
          <h2>GraphQL Query Builder</h2>
          <button
            type="button"
            [disabled]="metadataLoading"
            (click)="refreshMetadata()">
            Refresh schema
          </button>
        </div>
        <div class="gql-builder__endpoint">
          <label class="gql-builder__endpoint-label" for="gql-endpoint-url">
            GraphQL endpoint URL
          </label>
          <input
            id="gql-endpoint-url"
            type="text"
            class="gql-builder__endpoint-input"
            [formControl]="endpointUrl"
            placeholder="https://countries.trevorblades.com/graphql"
            autocomplete="off"
            spellcheck="false" />
          <p class="gql-builder__endpoint-hint">
            The schema loads automatically when the URL changes, or click
            Refresh schema.
          </p>
          <p *ngIf="metadataLoading" class="gql-builder__endpoint-loading">
            Loading schema…
          </p>
          <p *ngIf="metadataError" class="gql-builder__endpoint-error">
            {{ metadataError }}
          </p>
          <label class="gql-builder__endpoint-label" for="gql-http-headers">
            HTTP headers (JSON, optional)
          </label>
          <textarea
            id="gql-http-headers"
            class="gql-builder__endpoint-headers"
            rows="3"
            [formControl]="httpHeadersJson"
            placeholder='{"Authorization":"Bearer your-token"}'
            autocomplete="off"
            spellcheck="false"></textarea>
          <p class="gql-builder__endpoint-hint">
            Sent with every request, e.g. <code>Authorization</code> or an API
            key header.
          </p>
        </div>
      </header>

      <div class="gql-builder__panels">
        <aside class="gql-builder__panel">
          <div
            *ngIf="metadata"
            class="gql-builder__operation"
            role="tablist"
            aria-label="GraphQL operation type">
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="documentOperationKind === 'query'"
              [class.is-active]="documentOperationKind === 'query'"
              (click)="setOperationKind('query')">
              Query
            </button>
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="documentOperationKind === 'mutation'"
              [disabled]="!metadata.mutationType"
              [class.is-active]="documentOperationKind === 'mutation'"
              [attr.title]="
                !metadata.mutationType ? 'Schema has no Mutation root' : null
              "
              (click)="setOperationKind('mutation')">
              Mutation
            </button>
          </div>
          <h3>Root {{ documentOperationKind === 'mutation' ? 'mutations' : 'fields' }}</h3>
          <input
            type="search"
            class="gql-builder__search"
            placeholder="Filter…"
            [formControl]="objectFilter" />
          <ul class="gql-builder__objects">
            <li
              *ngFor="let field of filteredRootFields(); trackBy: trackByName"
              [class.is-active]="field === activeField"
              (click)="selectRoot(field)">
              <span>{{ field.name }}</span>
              <small>{{ field.typeName }}</small>
            </li>
          </ul>
        </aside>

        <aside class="gql-builder__panel">
          <h3>Fields</h3>
          <p *ngIf="!activeField" class="gql-builder__hint">
            Pick a root field on the left to see what you can select.
          </p>
          <app-graphql-field-tree
            *ngIf="activeField"
            [nodes]="[activeField]"
            [metadata]="metadata"
            (selectionChange)="onSelectionChange($event)">
          </app-graphql-field-tree>
        </aside>

        <section class="gql-builder__panel gql-builder__panel--editor">
          <h3>Arguments</h3>
          <app-graphql-argument-editor
            [field]="focusedField"
            [metadata]="metadata"
            (argumentsChange)="onArgumentsChange()">
          </app-graphql-argument-editor>

          <h3>Generated GraphQL</h3>
          <textarea
            class="gql-builder__editor"
            rows="12"
            [formControl]="queryControl"></textarea>

          <label class="gql-builder__endpoint-label" for="gql-variables-json">
            Variables (JSON)
          </label>
          <textarea
            id="gql-variables-json"
            class="gql-builder__endpoint-headers"
            rows="4"
            [formControl]="variablesJson"
            placeholder='{"input":{"title":"Hello","body":"World","userId":1}}'
            autocomplete="off"
            spellcheck="false"></textarea>
          <p class="gql-builder__endpoint-hint">
            Keys match variable names without the <code>$</code> (e.g.
            <code>$input</code> → <code>"input"</code>). Only used when an
            argument references a variable; inline values ignore this box.
          </p>

          <div class="gql-builder__actions">
            <button
              type="button"
              [disabled]="!queryControl.value"
              (click)="testQuery()">
              Test
            </button>
            <button
              type="button"
              class="is-primary"
              [disabled]="!queryControl.value"
              (click)="submitQuery()">
              Submit
            </button>
          </div>

          <pre
            *ngIf="testResult"
            class="gql-builder__result"
            [class.is-error]="!testResult.ok">{{ testResult | json }}</pre>
        </section>
      </div>
    </section>
  `,
})
export class GraphqlQueryBuilderComponent implements OnInit, OnChanges {
  /** Optional initial value for the endpoint URL input. */
  @Input() graphqlEndpointUrl?: string;

  /** Optional initial JSON object of HTTP headers (same shape as the textarea). */
  @Input() graphqlHttpHeadersJson?: string;

  /** Optional initial JSON object of GraphQL variables (same shape as the variables textarea). */
  @Input() graphqlVariablesJson?: string;

  @Output() submitted = new EventEmitter<GraphqlQueryPayload>();

  metadata: GraphqlMetadata | null = null;
  metadataError: string | null = null;
  metadataLoading = false;
  rootFields: GraphqlFieldNode[] = [];
  activeField: GraphqlFieldNode | null = null;
  focusedField: GraphqlFieldNode | null = null;
  testResult: GraphqlTestResult | null = null;
  /** Drives root field list and generated document keyword (`mutation` vs query shorthand). */
  documentOperationKind: GraphqlDocumentOperationKind = 'query';

  readonly queryControl = new FormControl('', { nonNullable: true });
  readonly objectFilter = new FormControl('', { nonNullable: true });
  readonly endpointUrl = new FormControl('', { nonNullable: true });
  readonly httpHeadersJson = new FormControl('', { nonNullable: true });
  readonly variablesJson = new FormControl('', { nonNullable: true });

  private schemaSubscription?: Subscription;

  constructor(
    private readonly metadataService: GraphqlMetadataService,
    private readonly queryBuilder: GraphqlQueryBuilderService,
    private readonly validator: GraphqlQueryValidatorService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.endpointUrl.valueChanges
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.refreshMetadata());

    this.httpHeadersJson.valueChanges
      .pipe(
        debounceTime(450),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.refreshMetadata());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['graphqlEndpointUrl']) {
      const v = changes['graphqlEndpointUrl'].currentValue as string | undefined;
      this.endpointUrl.setValue(v ?? '', { emitEvent: false });
      if (!changes['graphqlEndpointUrl'].firstChange) {
        queueMicrotask(() => this.refreshMetadata());
      }
    }
    if (changes['graphqlHttpHeadersJson']) {
      const v = changes['graphqlHttpHeadersJson'].currentValue as
        | string
        | undefined;
      this.httpHeadersJson.setValue(v ?? '', { emitEvent: false });
      if (!changes['graphqlHttpHeadersJson'].firstChange) {
        queueMicrotask(() => this.refreshMetadata());
      }
    }
    if (changes['graphqlVariablesJson']) {
      const v = changes['graphqlVariablesJson'].currentValue as
        | string
        | undefined;
      this.variablesJson.setValue(v ?? '', { emitEvent: false });
    }
  }

  ngOnInit(): void {
    setTimeout(() => this.refreshMetadata(), 0);
  }

  refreshMetadata(): void {
    this.schemaSubscription?.unsubscribe();

    this.metadataError = null;
    this.testResult = null;

    const url = this.endpointUrl.value.trim();

    let headerOpts: Record<string, string> | undefined;
    try {
      headerOpts = this.optionalHeadersFromForm();
    } catch (e) {
      this.metadataLoading = false;
      this.metadataError =
        e instanceof Error ? e.message : 'Invalid HTTP headers JSON.';
      this.metadata = null;
      this.rootFields = [];
      this.activeField = null;
      this.focusedField = null;
      this.queryControl.setValue('', { emitEvent: false });
      this.variablesJson.setValue('', { emitEvent: false });
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      return;
    }

    const load$ =
      url.length > 0
        ? this.metadataService.loadFromEndpoint(url, headerOpts)
        : null;

    if (!load$) {
      this.metadataLoading = false;
      this.metadataError = 'Enter a GraphQL endpoint URL above.';
      this.metadata = null;
      this.rootFields = [];
      this.activeField = null;
      this.focusedField = null;
      this.queryControl.setValue('', { emitEvent: false });
      this.variablesJson.setValue('', { emitEvent: false });
      this.cdr.markForCheck();
      return;
    }

    this.metadataLoading = true;
    this.cdr.markForCheck();

    this.schemaSubscription = load$
      .pipe(
        finalize(() => {
          this.metadataLoading = false;
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
      next: metadata => {
        this.metadata = metadata;
        this.documentOperationKind = 'query';
        this.rootFields = this.buildRootFields(metadata);
        this.activeField = null;
        this.focusedField = null;
        this.queryControl.setValue('');
        this.variablesJson.setValue(this.graphqlVariablesJson ?? '', {
          emitEvent: false,
        });
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
      error: (err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Failed to load schema.';
        this.metadataError = message;
        this.metadata = null;
        this.rootFields = [];
        this.activeField = null;
        this.focusedField = null;
        this.queryControl.setValue('', { emitEvent: false });
        this.variablesJson.setValue('', { emitEvent: false });
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      },
    });
  }

  trackByName(_index: number, node: GraphqlFieldNode): string {
    return node.name;
  }

  filteredRootFields(): GraphqlFieldNode[] {
    const term = this.objectFilter.value.trim().toLowerCase();
    if (!term) {
      return this.rootFields;
    }
    return this.rootFields.filter(field =>
      field.name.toLowerCase().includes(term),
    );
  }

  setOperationKind(kind: GraphqlDocumentOperationKind): void {
    if (
      kind === this.documentOperationKind ||
      !this.metadata ||
      (kind === 'mutation' && !this.metadata.mutationType)
    ) {
      return;
    }
    this.documentOperationKind = kind;
    this.rootFields = this.buildRootFields(this.metadata);
    this.activeField = null;
    this.focusedField = null;
    this.testResult = null;
    this.queryControl.setValue('', { emitEvent: false });
    this.variablesJson.setValue('', { emitEvent: false });
    this.cdr.markForCheck();
  }

  selectRoot(field: GraphqlFieldNode): void {
    this.activeField = field;
    this.focusedField = field;
    this.metadataService.loadChildrenIfNeeded(field, this.metadata);
    if (!field.expanded) {
      field.expanded = true;
    }
    this.cdr.markForCheck();
  }

  onSelectionChange(node: GraphqlFieldNode): void {
    this.focusedField = node;
    this.regenerateQuery();
  }

  onArgumentsChange(): void {
    this.regenerateQuery();
  }

  testQuery(): void {
    let payload: GraphqlQueryPayload;
    try {
      payload = this.payloadFromEditor();
    } catch (e) {
      this.testResult = {
        ok: false,
        errors: [
          {
            message:
              e instanceof Error
                ? e.message
                : 'Invalid JSON in headers or variables.',
          },
        ],
      };
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      return;
    }

    const url = this.endpointUrl.value.trim();
    const test$ =
      url.length > 0
        ? this.validator.testQueryAtEndpoint(url, payload, payload.httpHeaders)
        : null;

    if (!test$) {
      this.testResult = {
        ok: false,
        errors: [{ message: 'Set an endpoint URL to run tests.' }],
      };
      this.cdr.markForCheck();
      return;
    }

    test$.subscribe(result => {
      this.testResult = result;
      this.cdr.markForCheck();
    });
  }

  submitQuery(): void {
    try {
      this.submitted.emit(this.payloadFromEditor());
    } catch (e) {
      this.testResult = {
        ok: false,
        errors: [
          {
            message:
              e instanceof Error
                ? e.message
                : 'Invalid JSON in headers or variables.',
          },
        ],
      };
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }
  }

  private regenerateQuery(): void {
    if (!this.activeField) {
      return;
    }
    try {
      const doc = this.queryBuilder.buildDocument(
        this.documentOperationKind,
        [this.activeField],
      );
      this.queryControl.setValue(doc, { emitEvent: false });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Could not build GraphQL document.';
      this.testResult = { ok: false, errors: [{ message }] };
    }
    this.cdr.markForCheck();
  }

  private payloadFromEditor(): GraphqlQueryPayload {
    const httpHeaders = this.optionalHeadersFromForm();
    const variables = parseGraphqlVariablesJson(this.variablesJson.value);
    return {
      query: this.queryControl.value,
      variables,
      ...(httpHeaders ? { httpHeaders } : {}),
    };
  }

  private optionalHeadersFromForm(): Record<string, string> | undefined {
    const raw = this.httpHeadersJson.value.trim();
    if (!raw) {
      return undefined;
    }
    const parsed = parseHttpHeadersJson(raw);
    return Object.keys(parsed).length ? parsed : undefined;
  }

  /**
   * Pulls the root Query or Mutation type from metadata and converts
   * each top-level field into a tree node so the user can drill in.
   */
  private buildRootFields(metadata: GraphqlMetadata): GraphqlFieldNode[] {
    const rootName =
      this.documentOperationKind === 'mutation'
        ? metadata.mutationType
        : metadata.queryType;

    const rootType = rootName
      ? metadata.objects.find(
          (object: GraphqlObjectType) => object.name === rootName,
        )
      : undefined;

    if (!rootType) {
      return [];
    }
    return rootType.fields.map(field =>
      this.metadataService.toFieldNode(field, metadata),
    );
  }
}
