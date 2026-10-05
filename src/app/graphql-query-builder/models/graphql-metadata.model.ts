/**
 * Normalized GraphQL metadata used by the query builder UI.
 *
 * `GraphqlMetadataService` converts the raw introspection result
 * (`__schema`) into this shape.
 */

export type GraphqlKind =
  | 'SCALAR'
  | 'OBJECT'
  | 'INTERFACE'
  | 'UNION'
  | 'ENUM'
  | 'INPUT_OBJECT'
  | 'LIST'
  | 'NON_NULL';

export interface GraphqlArgument {
  name: string;
  description?: string;
  typeName: string;
  kind: GraphqlKind;
  required: boolean;
  defaultValue?: string | null;
  enumValues?: string[];
}

export interface GraphqlField {
  name: string;
  description?: string;
  typeName: string;
  kind: GraphqlKind;
  isList: boolean;
  isScalar: boolean;
  args: GraphqlArgument[];
}

export interface GraphqlObjectType {
  name: string;
  description?: string;
  fields: GraphqlField[];
}

export interface GraphqlMetadata {
  queryType: string;
  mutationType?: string;
  subscriptionType?: string;
  objects: GraphqlObjectType[];
  enums: Record<string, string[]>;
}

/**
 * UI-side tree node. Mirrors the metadata but tracks selection,
 * expansion, and per-argument values entered by the user.
 */
export interface GraphqlFieldNode {
  name: string;
  typeName: string;
  kind: GraphqlKind;
  isList: boolean;
  isScalar: boolean;
  description?: string;
  args: GraphqlArgument[];
  argumentValues: Record<string, string>;
  selected: boolean;
  expanded: boolean;
  children: GraphqlFieldNode[];
  childrenLoaded: boolean;
}
