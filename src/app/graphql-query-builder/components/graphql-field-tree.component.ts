import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import {
  GraphqlFieldNode,
  GraphqlMetadata,
} from '../models/graphql-metadata.model';
import { GraphqlMetadataService } from '../services/graphql-metadata.service';

/**
 * Renders a recursive tree of GraphQL fields. Each scalar field gets
 * a checkbox; each object field gets an expand button so its
 * sub-fields can be loaded lazily from the schema metadata.
 *
 * Selecting a field is what drives query generation - the parent
 * component reads the same `nodes` reference to build the query.
 */
@Component({
  selector: 'app-graphql-field-tree',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./graphql-field-tree.component.scss'],
  template: `
    <ul class="gql-tree">
      <li *ngFor="let node of nodes; trackBy: trackByName" class="gql-tree__item">
        <div class="gql-tree__row">
          <button
            type="button"
            class="gql-tree__toggle"
            [class.gql-tree__toggle--leaf]="node.isScalar"
            [disabled]="node.isScalar"
            (click)="toggleExpand(node)"
            [attr.aria-label]="node.expanded ? 'Collapse' : 'Expand'">
            <span *ngIf="!node.isScalar">{{ node.expanded ? '-' : '+' }}</span>
          </button>

          <label class="gql-tree__label">
            <input
              type="checkbox"
              [checked]="node.selected"
              (change)="toggleSelected(node, $event)" />
            <span class="gql-tree__name">{{ node.name }}</span>
            <span class="gql-tree__type">
              {{ node.isList ? '[' + node.typeName + ']' : node.typeName }}
            </span>
          </label>

          <span
            *ngIf="node.args.length > 0"
            class="gql-tree__args"
            [attr.title]="argsTooltip(node)">
            args: {{ node.args.length }}
          </span>
        </div>

        <app-graphql-field-tree
          *ngIf="node.expanded && !node.isScalar"
          [nodes]="node.children"
          [metadata]="metadata"
          (selectionChange)="selectionChange.emit($event)">
        </app-graphql-field-tree>
      </li>
    </ul>
  `,
})
export class GraphqlFieldTreeComponent {
  @Input() nodes: GraphqlFieldNode[] = [];
  @Input() metadata: GraphqlMetadata | null = null;

  @Output() selectionChange = new EventEmitter<GraphqlFieldNode>();

  constructor(private readonly metadataService: GraphqlMetadataService) {}

  trackByName(_index: number, node: GraphqlFieldNode): string {
    return node.name;
  }

  toggleExpand(node: GraphqlFieldNode): void {
    if (node.isScalar) {
      return;
    }

    this.metadataService.loadChildrenIfNeeded(node, this.metadata);

    node.expanded = !node.expanded;
  }

  toggleSelected(node: GraphqlFieldNode, event: Event): void {
    const input = event.target as HTMLInputElement;
    node.selected = input.checked;

    if (node.selected && !node.isScalar && !node.expanded) {
      this.toggleExpand(node);
    }

    this.selectionChange.emit(node);
  }

  argsTooltip(node: GraphqlFieldNode): string {
    return node.args
      .map(arg => `${arg.name}: ${arg.typeName}${arg.required ? '!' : ''}`)
      .join(', ');
  }
}
