import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  GraphqlFieldNode,
  GraphqlMetadata,
} from '../models/graphql-metadata.model';

/**
 * Edits arguments for a single field. Renders the right control
 * for each argument type (enum dropdown, number input, text, etc.).
 */
@Component({
  selector: 'app-graphql-argument-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./graphql-argument-editor.component.scss'],
  template: `
    <div class="gql-args" *ngIf="field; else noField">
      <header class="gql-args__header">
        <strong>{{ field.name }}</strong>
        <span class="gql-args__type">{{ field.typeName }}</span>
      </header>

      <p *ngIf="field.args.length === 0" class="gql-args__empty">
        This field does not accept any arguments.
      </p>

      <div *ngFor="let arg of field.args" class="gql-args__row">
        <label class="gql-args__label">
          {{ arg.name }}
          <span *ngIf="arg.required" class="gql-args__required">*</span>
          <small class="gql-args__hint">
            {{ arg.typeName }}{{ arg.required ? '!' : '' }}
          </small>
        </label>

        <select
          *ngIf="arg.kind === 'ENUM'; else textInput"
          [ngModel]="field.argumentValues[arg.name]"
          (ngModelChange)="updateArgument(arg.name, $event)">
          <option value="">--</option>
          <option *ngFor="let value of enumValues(arg.typeName)" [value]="value">
            {{ value }}
          </option>
        </select>

        <ng-template #textInput>
          <input
            type="text"
            [ngModel]="field.argumentValues[arg.name]"
            (ngModelChange)="updateArgument(arg.name, $event)"
            [placeholder]="placeholder(arg.typeName)" />
        </ng-template>
      </div>
    </div>

    <ng-template #noField>
      <p class="gql-args__empty">Select a field to edit its arguments.</p>
    </ng-template>
  `,
})
export class GraphqlArgumentEditorComponent {
  @Input() field: GraphqlFieldNode | null = null;
  @Input() metadata: GraphqlMetadata | null = null;

  @Output() argumentsChange = new EventEmitter<GraphqlFieldNode>();

  enumValues(typeName: string): string[] {
    return this.metadata?.enums[typeName] ?? [];
  }

  placeholder(typeName: string): string {
    switch (typeName) {
      case 'Int':
      case 'Float':
        return '0';
      case 'Boolean':
        return 'true / false';
      case 'String':
      case 'ID':
        return '"value"';
      default:
        return '$variable or { … }';
    }
  }

  updateArgument(name: string, value: string): void {
    if (!this.field) {
      return;
    }
    this.field.argumentValues = {
      ...this.field.argumentValues,
      [name]: value,
    };
    this.argumentsChange.emit(this.field);
  }
}
