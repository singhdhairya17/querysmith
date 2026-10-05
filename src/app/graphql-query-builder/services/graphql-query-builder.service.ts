import { Injectable } from '@angular/core';

import {
  GraphqlArgument,
  GraphqlFieldNode,
} from '../models/graphql-metadata.model';
import { GraphqlQueryPayload } from '../models/graphql-query.model';

/** Top-level GraphQL operation written into the request document. */
export type GraphqlDocumentOperationKind = 'query' | 'mutation';

interface VariableCollector {
  orderedNames: string[];
  typesByName: Map<string, string>;
}

/**
 * Generates a GraphQL document string and JSON payload from the
 * field tree built up by the UI. Supports anonymous query shorthand,
 * `query`/`mutation` with variable definitions when args use `$name`,
 * and `mutation { ... }` documents (no fragments or aliases).
 */
@Injectable({ providedIn: 'root' })
export class GraphqlQueryBuilderService {
  buildPayload(
    rootFields: GraphqlFieldNode[],
    operationKind: GraphqlDocumentOperationKind = 'query',
    variables: Record<string, unknown> = {},
  ): GraphqlQueryPayload {
    return {
      query: this.buildDocument(operationKind, rootFields),
      variables,
    };
  }

  /** Anonymous query shorthand when no `$` variables appear in arguments. */
  buildQuery(rootFields: GraphqlFieldNode[]): string {
    return this.buildDocument('query', rootFields);
  }

  /**
   * Builds the request document. Uses shorthand `{ … }` for variable-free
   * queries; `query ($a: …) { … }` / `mutation ($a: …) { … }` when every
   * argument value referencing `$foo` declares `$foo` (types from introspection).
   */
  buildDocument(
    operationKind: GraphqlDocumentOperationKind,
    rootFields: GraphqlFieldNode[],
  ): string {
    const selected = rootFields.filter(field => field.selected);
    if (selected.length === 0) {
      return '';
    }

    const collector: VariableCollector = {
      orderedNames: [],
      typesByName: new Map<string, string>(),
    };

    const body = selected
      .map(field => this.buildField(field, 1, collector))
      .join('\n');

    return this.wrapOperation(operationKind, collector, body);
  }

  private wrapOperation(
    operationKind: GraphqlDocumentOperationKind,
    collector: VariableCollector,
    body: string,
  ): string {
    const hasVars = collector.orderedNames.length > 0;
    const defs = collector.orderedNames
      .map(n => `$${n}: ${collector.typesByName.get(n)!}`)
      .join(', ');
    const varPart = hasVars ? `(${defs}) ` : '';

    if (operationKind === 'mutation') {
      return `mutation ${varPart}{\n${body}\n}`;
    }

    if (hasVars) {
      return `query ${varPart}{\n${body}\n}`;
    }

    return `{\n${body}\n}`;
  }

  private buildField(
    field: GraphqlFieldNode,
    depth: number,
    collector: VariableCollector,
  ): string {
    this.registerVarsFromArguments(field, collector);

    const indent = '  '.repeat(depth);
    const args = this.buildArguments(field);
    const selectedChildren = field.children.filter(child => child.selected);

    if (field.isScalar || selectedChildren.length === 0) {
      return `${indent}${field.name}${args}`;
    }

    const inner = selectedChildren
      .map(child => this.buildField(child, depth + 1, collector))
      .join('\n');

    return `${indent}${field.name}${args} {\n${inner}\n${indent}}`;
  }

  private registerVarsFromArguments(
    field: GraphqlFieldNode,
    collector: VariableCollector,
  ): void {
    for (const arg of field.args) {
      const raw = field.argumentValues[arg.name];
      if (
        raw === undefined ||
        raw === '' ||
        typeof raw !== 'string' ||
        !raw.startsWith('$')
      ) {
        continue;
      }

      const name = raw.slice(1).trim();
      if (!/^[_A-Za-z][_0-9A-Za-z]*$/.test(name)) {
        continue;
      }

      const graphqlType = this.graphqlVariableType(arg);
      const existingType = collector.typesByName.get(name);
      if (existingType !== undefined && existingType !== graphqlType) {
        throw new Error(
          `Variable "$${name}" is used as ${graphqlType} and ${existingType} — use distinct names.`,
        );
      }

      if (existingType === undefined) {
        collector.typesByName.set(name, graphqlType);
        collector.orderedNames.push(name);
      }
    }
  }

  private graphqlVariableType(arg: GraphqlArgument): string {
    const base = arg.typeName;
    return arg.required ? `${base}!` : base;
  }

  private buildArguments(field: GraphqlFieldNode): string {
    const entries = field.args
      .map(arg => this.formatArgument(arg, field.argumentValues[arg.name]))
      .filter((entry): entry is string => entry !== null);

    if (entries.length === 0) {
      return '';
    }
    return `(${entries.join(', ')})`;
  }

  private formatArgument(
    arg: GraphqlArgument,
    rawValue: string | undefined,
  ): string | null {
    if (rawValue === undefined || rawValue === '') {
      return null;
    }

    const value = this.formatValue(arg, rawValue);
    return `${arg.name}: ${value}`;
  }

  private formatValue(arg: GraphqlArgument, rawValue: string): string {
    if (arg.kind === 'ENUM') {
      return rawValue;
    }
    if (arg.typeName === 'Int' || arg.typeName === 'Float') {
      return rawValue;
    }
    if (arg.typeName === 'Boolean') {
      return rawValue === 'true' ? 'true' : 'false';
    }
    if (rawValue.startsWith('$')) {
      return rawValue;
    }
    if (rawValue.startsWith('{') || rawValue.startsWith('[')) {
      return rawValue;
    }
    return JSON.stringify(rawValue);
  }
}
