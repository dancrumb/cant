import type {
  Cardinality,
  EntityDeclaration,
  Expression,
  Identifier,
  ModelDeclaration,
  RelationDeclaration,
} from '@dancrumb/cant-shared';
import type { Position } from 'unist';
import { error, type Diagnostic } from './diagnostic.ts';
import type { LoadedProgram, Module, ModuleSymbol } from './modules.ts';
import type { References } from './resolve.ts';

/** A navigation field that a relation adds to an entity (docs/adr/0035-entity-relationships.md). */
export interface NavigationField {
  name: Identifier;
  /** The entity at the far end. */
  far: ModuleSymbol;
  /** The cardinality written beside the far end, which decides the field's type. */
  farCardinality: Cardinality;
  relation: RelationDeclaration;
}

/** A group kind, declared by an entity's `group` line, and the roles declared beside it. */
interface GroupKind {
  name: Identifier;
  entity: EntityDeclaration;
  roles: Set<string>;
}

const keyOf = (symbol: ModuleSymbol): string => `${symbol.module}::${symbol.name}`;

/**
 * Check what entities, relations and the security declarations refer to, across the whole
 * program:
 *
 * - each relation's navigation fields, which must not clash with each other or with the
 *   entity's model fields (docs/adr/0035-entity-relationships.md);
 * - the fields an entity's `expose`, `hide`, `identity` and `membership` lines name, which must
 *   be fields of its model or, for `identity` and `membership`, navigation fields that reach one
 *   entity (docs/adr/0022-entities.md, 0010, 0032);
 * - that subject entities have an `identity`, whose fields claims can carry
 *   (docs/adr/0010-security.md, 0032), and that roles are only declared beside a `group` line;
 * - the group kinds and roles that `permissions` declarations and role predicates name, and the
 *   permissions that `can` predicates check (docs/adr/0010-security.md).
 */
export function checkEntities(program: LoadedProgram, references: References): { navigation: Map<string, Map<string, NavigationField>>; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const reportIn = (module: Module) => (diagnostic: Diagnostic): void => {
    diagnostics.push({ ...diagnostic, file: module.path });
  };

  const entities = new Map<string, { module: Module; declaration: EntityDeclaration; model?: ModelDeclaration }>();
  for (const module of program.modules.values()) {
    for (const namespace of module.symbols?.namespaces.values() ?? []) {
      for (const declaration of namespace.types.values()) {
        if (declaration.type !== 'entity') continue;
        const modelName = declaration.lines.find((line) => line.type === 'modelsBlock')?.models[0];
        const model = modelName === undefined ? undefined : references.get(modelName)?.declaration;
        entities.set(`${module.path}::${declaration.name.value}`, {
          module,
          declaration,
          ...(model?.type === 'model' && { model }),
        });
      }
    }
  }

  // Each entity's navigation fields, from both ends of every relation.
  const navigation = new Map<string, Map<string, NavigationField>>();
  for (const module of program.modules.values()) {
    const report = reportIn(module);
    for (const { declaration: relation } of module.symbols?.relations ?? []) {
      const left = references.get(relation.left.entity);
      const right = references.get(relation.right.entity);
      if (left === undefined || right === undefined) continue;
      const ends: [ModuleSymbol, Identifier, ModuleSymbol, Cardinality][] = [
        [left, relation.left.field, right, relation.right.cardinality],
        [right, relation.right.field, left, relation.left.cardinality],
      ];
      for (const [entity, field, far, farCardinality] of ends) {
        let fields = navigation.get(keyOf(entity));
        if (fields === undefined) {
          fields = new Map();
          navigation.set(keyOf(entity), fields);
        }
        const earlier = fields.get(field.value);
        const modelField = entities.get(keyOf(entity))?.model?.fields.find((candidate) => candidate.name.value === field.value);
        if (earlier !== undefined || modelField !== undefined) {
          report(
            error(
              'navigation-clash',
              `${entity.name} already has a field called ${field.value}${earlier === undefined ? ', from its model' : ', from another relation'}. A navigation field needs a name of its own.`,
              field.position,
            ),
          );
          continue;
        }
        fields.set(field.value, { name: field, far, farCardinality, relation });
      }
    }
  }

  // Group kinds and their roles, across the program.
  const groups = new Map<string, GroupKind>();
  for (const { module, declaration } of entities.values()) {
    const group = declaration.lines.find((line) => line.type === 'groupLine');
    if (group === undefined) continue;
    const earlier = groups.get(group.name.value);
    if (earlier !== undefined) {
      reportIn(module)(
        error(
          'duplicate-group',
          `${earlier.entity.name.value} already declares a group kind called ${group.name.value}. Each group kind needs its own name.`,
          group.name.position,
        ),
      );
      continue;
    }
    groups.set(group.name.value, {
      name: group.name,
      entity: declaration,
      roles: new Set(declaration.lines.flatMap((line) => (line.type === 'roleLine' ? [line.name.value] : []))),
    });
  }

  for (const [key, { module, declaration, model }] of entities) {
    checkEntity(declaration, model, navigation.get(key) ?? new Map<string, NavigationField>(), entities, references, reportIn(module));
  }

  // Permissions name a group kind, and maybe a role in it.
  const permissions = new Set<string>();
  for (const module of program.modules.values()) {
    const report = reportIn(module);
    for (const { declaration } of module.symbols?.permissions ?? []) {
      for (const permission of declaration.permissions) permissions.add(textOf(permission));
      const group = groups.get(declaration.group.value);
      if (group === undefined) {
        report(error('unknown-group', `No entity declares a group kind called ${declaration.group.value}.`, declaration.group.position));
      } else if (declaration.role !== undefined && !group.roles.has(declaration.role.value)) {
        report(
          error(
            'unknown-role',
            `The ${group.name.value} group kind, declared by ${group.entity.name.value}, has no role called ${declaration.role.value}.`,
            declaration.role.position,
          ),
        );
      }
    }
  }

  // Predicates check permissions that some declaration grants, and roles some group kind has.
  const roles = new Set([...groups.values()].flatMap((group) => [...group.roles]));
  for (const module of program.modules.values()) {
    const report = reportIn(module);
    visitPredicates(module, (predicate) => {
      if (predicate.type === 'canPredicate' && !permissions.has(textOf(predicate.permission))) {
        report(
          error(
            'unknown-permission',
            `No \`permissions\` declaration grants "${textOf(predicate.permission)}", so no subject can ever have it.`,
            predicate.permission.position,
          ),
        );
      }
      if (predicate.type === 'rolePredicate' && !roles.has(predicate.role.value)) {
        report(error('unknown-role', `No group kind has a role called ${predicate.role.value}.`, predicate.role.position));
      }
    });
  }

  return { navigation, diagnostics };
}

/** The types claims can carry, so a subject entity's `identity` fields must have one (docs/adr/0032-authentication.md). */
const CLAIM_TYPES = new Set(['TEXT', 'NUMBER', 'BOOLEAN']);

function checkEntity(
  declaration: EntityDeclaration,
  model: ModelDeclaration | undefined,
  navigation: Map<string, NavigationField>,
  entities: Map<string, { declaration: EntityDeclaration }>,
  references: References,
  report: (diagnostic: Diagnostic) => void,
): void {
  const has = (type: EntityDeclaration['lines'][number]['type']): boolean => declaration.lines.some((line) => line.type === type);
  const isSubject = has('subjectLine');

  if (has('roleLine') && !has('groupLine')) {
    const role = declaration.lines.find((line) => line.type === 'roleLine');
    report(
      error(
        'role-without-group',
        `${declaration.name.value} declares a role but has no \`group\` line, so there is no group for a member to hold the role in.`,
        role?.position ?? declaration.name.position,
      ),
    );
  }
  if (isSubject && !has('identityLine')) {
    report(
      error(
        'missing-identity',
        `${declaration.name.value} is a subject, so it needs an \`identity\` line: the fields that match an authenticated request to one ${declaration.name.value}.`,
        declaration.name.position,
      ),
    );
  }
  const membership = declaration.lines.find((line) => line.type === 'membershipLine');
  if (membership !== undefined && (isSubject || has('groupLine'))) {
    report(
      error(
        'membership-conflict',
        `${declaration.name.value} has a \`membership\` line, so it can't also be a subject or a group.`,
        membership.position,
      ),
    );
  }

  // Without a model, the field names can't be checked.
  if (model === undefined) return;
  const fields = new Map(model.fields.map((field) => [field.name.value, field]));

  const unknownField = (name: Identifier, where: string): void => {
    report(
      error(
        'unknown-field',
        `${declaration.name.value}'s model, ${model.name.value}, has no field called ${name.value}, so ${where} can't name it.`,
        name.position,
      ),
    );
  };

  const exposed = new Set<string>();
  for (const line of declaration.lines) {
    if (line.type === 'exposeBlock') {
      for (const item of line.items) {
        if (item.type === 'builtIn') continue;
        if (!fields.has(item.field.value)) unknownField(item.field, 'its `expose` block');
        exposed.add(item.field.value);
      }
    }
  }
  for (const line of declaration.lines) {
    if (line.type !== 'hideBlock') continue;
    for (const item of line.items) {
      if (item.type === 'builtIn') continue;
      if (!fields.has(item.value)) unknownField(item, 'its `hide` block');
      else if (exposed.has(item.value)) {
        report(
          error('exposed-and-hidden', `${item.value} is listed in both the \`expose\` and \`hide\` blocks.`, item.position),
        );
      }
    }
  }

  // A field that reaches exactly one entity: a model field, or a navigation field whose far end is `1`.
  const single = (name: Identifier, where: string): NavigationField | 'model' | undefined => {
    if (fields.has(name.value)) return 'model';
    const field = navigation.get(name.value);
    if (field === undefined) {
      unknownField(name, where);
      return undefined;
    }
    if (field.farCardinality !== '1') {
      report(
        error(
          'not-single',
          `${name.value} is a navigation field that can reach ${field.farCardinality === '0..1' ? 'no' : 'several'} entities, so ${where} can't name it: it must reach exactly one.`,
          name.position,
        ),
      );
      return undefined;
    }
    return field;
  };

  const identity = declaration.lines.find((line) => line.type === 'identityLine');
  for (const name of identity?.fields ?? []) {
    const field = single(name, 'its `identity` line');
    if (!isSubject || field === undefined) continue;
    // A subject's identity is matched against claims, which carry text, numbers, booleans and enum values.
    const type = field === 'model' ? fields.get(name.value)?.valueType : undefined;
    const claimable =
      type !== undefined &&
      ((type.type === 'baseType' && CLAIM_TYPES.has(type.name)) ||
        type.type === 'enum' ||
        ((type.type === 'identifier' || type.type === 'qualifiedIdentifier') && references.get(type)?.typeKind === 'enum'));
    if (!claimable) {
      report(
        error(
          'identity-type',
          `${declaration.name.value} is a subject, so its \`identity\` fields must be TEXT, NUMBER, BOOLEAN or an enum, the values claims can carry. ${name.value} isn't.`,
          name.position,
        ),
      );
    }
  }

  if (membership !== undefined) {
    const member = single(membership.member, 'its `membership` line');
    if (member === 'model') {
      report(error('not-navigation', `${membership.member.value} must be a navigation field that reaches a subject entity.`, membership.member.position));
    } else if (member !== undefined && !entities.get(keyOf(member.far))?.declaration.lines.some((line) => line.type === 'subjectLine')) {
      report(error('not-subject', `${membership.member.value} reaches ${member.far.name}, which isn't a subject entity.`, membership.member.position));
    }
    const group = single(membership.group, 'its `membership` line');
    if (group === 'model') {
      report(error('not-navigation', `${membership.group.value} must be a navigation field that reaches a group entity.`, membership.group.position));
    } else if (group !== undefined && !entities.get(keyOf(group.far))?.declaration.lines.some((line) => line.type === 'groupLine')) {
      report(error('not-group', `${membership.group.value} reaches ${group.far.name}, which isn't a group entity.`, membership.group.position));
    }
    if (membership.roles !== undefined && !fields.has(membership.roles.value)) unknownField(membership.roles, 'its `membership` line');
  }
}

const textOf = (literal: { parts: { type: string; value?: unknown }[] }): string =>
  literal.parts.map((part) => (part.type === 'text' && typeof part.value === 'string' ? part.value : '')).join('');

type Predicate = Extract<Expression, { type: 'canPredicate' | 'rolePredicate' }>;

/** Call `visit` on every `can` and role predicate in a module, wherever it is. */
function visitPredicates(module: Module, visit: (predicate: Predicate) => void): void {
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const typed = node as { type?: unknown; position?: Position } & Record<string, unknown>;
    if (typed.type === 'canPredicate' || typed.type === 'rolePredicate') visit(typed as unknown as Predicate);
    for (const [key, value] of Object.entries(typed)) if (key !== 'position') walk(value);
  };
  walk(module.program?.children);
}
