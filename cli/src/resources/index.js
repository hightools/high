import {join, resolve, dirname, basename, isAbsolute} from 'path';
import {existsSync} from 'fs';
import {isPlainObject, isEmpty} from 'lodash';
import isDirectory from 'is-directory';
import {
  loadFile,
  addContextToErrors,
  getProperty,
  setProperty,
  formatString,
  formatPath,
  formatCode
} from 'run-common';

import Version from '../version';
import Runtime from '../runtimes';

const RESOURCE_FILE_FORMATS = ['json5', 'json', 'yaml', 'yml'];
const RESOURCE_FILE_NAME = 'resource';

export class Resource {
  constructor(definition: {} = {}, {directory, file} = {}) {
    addContextToErrors(() => {
      if (directory !== undefined) this.$setDirectory(directory);
      if (file !== undefined) this.$setFile(file);
      setProperty(this, definition, '$id');
      setProperty(this, definition, '$aliases', ['$alias']);
      setProperty(this, definition, '$version');
      setProperty(this, definition, '$description');
      setProperty(this, definition, '$authors', ['$author']);
      setProperty(this, definition, '$repository');
      setProperty(this, definition, '$license');
      setProperty(this, definition, '$implementation');
      setProperty(this, definition, '$runtime');
    }).call(this);
  }

  static async $create(definition = {}, options = {}) {
    if (typeof definition === 'boolean') {
      definition = {$type: 'boolean', $value: definition};
    } else if (typeof definition === 'number') {
      definition = {$type: 'number', $value: definition};
    } else if (typeof definition === 'string') {
      definition = {$type: 'string', $value: definition};
    } else if (Array.isArray(definition)) {
      definition = {$type: 'array', $value: definition};
    } else if (!isPlainObject(definition)) {
      throw new Error("'definition' argument is invalid");
    }

    if ('id' in options) {
      definition = {...definition, $id: options.id};
    }

    let types = getProperty(definition, ['$types', '$type']);
    types = this.$normalizeTypes(types);
    const ResourceClass = this.$getResourceClass(types);

    const resource = new ResourceClass(definition, options);
    if (resource.$initialization) {
      await resource.$initialization;
    }

    return resource;
  }

  static async $load(specifier: string, {directory} = {}) {
    let file;

    if (specifier.startsWith('.')) {
      file = resolve(directory, specifier);
    } else if (isAbsolute(specifier)) {
      file = specifier;
    } else {
      throw new Error('Loading from Resdir is not yet implemented');
    }

    file = this.$searchResourceFile(file);
    if (!file) {
      throw new Error(`Resource not found: ${formatPath(specifier)}`);
    }

    const definition = await loadFile(file, {parse: true});

    return await this.$create(definition, {file});
  }

  static $searchResourceFile(directoryOrFile, {searchInParentDirectories = false} = {}) {
    let directory;

    if (isDirectory.sync(directoryOrFile)) {
      directory = directoryOrFile;
    }

    if (!directory) {
      if (existsSync(directoryOrFile)) {
        const file = directoryOrFile;
        const filename = basename(file);
        if (RESOURCE_FILE_FORMATS.find(format => filename === RESOURCE_FILE_NAME + '.' + format)) {
          return file;
        }
      }
      return undefined;
    }

    for (const format of RESOURCE_FILE_FORMATS) {
      const file = join(directory, RESOURCE_FILE_NAME + '.' + format);
      if (existsSync(file)) {
        return file;
      }
    }

    if (searchInParentDirectories) {
      const parentDirectory = join(directory, '..');
      if (parentDirectory !== directory) {
        return this.$searchResourceFile(parentDirectory, {searchInParentDirectories});
      }
    }

    return undefined;
  }

  static $getResourceClass(types) {
    if (types.length === 1) {
      const type = types[0];
      if (typeof type === 'string') {
        switch (type) {
          case 'resource':
            return Resource;
          case 'boolean':
            return require('./boolean').default;
          case 'number':
            return require('./number').default;
          case 'string':
            return require('./string').default;
          case 'array':
            return require('./array').default;
          case 'object':
            return require('./object').default;
          default: // NOOP
        }
      }
    }

    return require('./object').default;
  }

  static $normalizeTypes(types) {
    if (types === undefined) {
      types = [];
    } else if (typeof types === 'string' || isPlainObject(types)) {
      types = [types];
    } else if (!Array.isArray(types)) {
      throw new Error(`Invalid ${formatCode('$type')} value`);
    }
    return types;
  }

  $instantiate(value) {
    const instance = new this.constructor();
    instance.$inherit(this);
    if (arguments.length) {
      instance.$set(value);
    }
    return instance;
  }

  _parents = [];

  $inherit(parent) {
    this._parents.push(parent);
  }

  $forSelfAndEachParent(fn, {skipSelf, deepSearch} = {}) {
    const resources = [this];
    let isSelf = true;
    while (resources.length) {
      const resource = resources.shift();
      if (!(isSelf && skipSelf)) {
        const result = fn(resource);
        if (result === false) break;
      }
      if (isSelf || deepSearch) {
        resources.push(...resource._parents);
      }
      isSelf = false;
    }
  }

  $forEachParent(fn, {deepSearch} = {}) {
    this.$forSelfAndEachParent(fn, {skipSelf: true, deepSearch});
  }

  $findParent(fn) {
    let result;
    this.$forEachParent(
      parent => {
        if (fn(parent)) {
          result = parent;
          return false; // Break forEachParent loop
        }
      },
      {deepSearch: true}
    );
    return result;
  }

  $isInstanceOf(resource) {
    return Boolean(this.$findParent(parent => parent === resource));
  }

  _getProperty(name) {
    let result;
    this.$forSelfAndEachParent(
      resource => {
        if (name in resource) {
          result = resource[name];
          return false;
        }
      },
      {deepSearch: true}
    );
    return result;
  }

  $getFile() {
    return this.__file;
  }

  $setFile(file) {
    this.__file = file;
  }

  $getDirectory() {
    return this.__directory || (this.$getFile() && dirname(this.$getFile()));
  }

  $setDirectory(directory) {
    this.__directory = directory;
  }

  get $id() {
    return this._getProperty('_id');
  }

  set $id(id: ?string) {
    if (id !== undefined) {
      if (!this.$validateId(id)) {
        throw new Error(`Resource id ${formatString(id)} is invalid`);
      }
    }
    this._id = id;
  }

  $validateId(id: string) {
    return this.$validateIdPart(id);
  }

  $validateIdPart(part: string) {
    if (!part) {
      return false;
    }

    if (/[^a-z0-9._-]/i.test(part)) {
      return false;
    }

    if (/[^a-z0-9]/i.test(part[0] + part[part.length - 1])) {
      return false;
    }

    return true;
  }

  get $aliases() {
    return this._getProperty('_aliases');
  }

  set $aliases(aliases: ?(Array | string)) {
    this._aliases = undefined;
    if (aliases) {
      if (typeof aliases === 'string') {
        aliases = [aliases];
      }
      for (const alias of aliases) {
        this.$addAlias(alias);
      }
    }
  }

  $addAlias(alias: string) {
    if (!this._aliases) {
      this._aliases = new Set();
    }
    this._aliases.add(alias);
  }

  $hasAlias(alias: string) {
    const aliases = this.$aliases;
    return Boolean(aliases && aliases.has(alias));
  }

  $isMatching(name: string, {ignoreAliases} = {}) {
    return this.$id === name || (!ignoreAliases && this.$hasAlias(name));
  }

  get $version() {
    return this._getProperty('_version');
  }

  set $version(version: ?(string | Version)) {
    if (typeof version === 'string') {
      version = new Version(version);
    }
    this._version = version;
  }

  get $description() {
    return this._getProperty('_description');
  }

  set $description(description: ?string) {
    this._description = description;
  }

  get $authors() {
    return this._getProperty('_authors');
  }

  set $authors(authors: ?(Array<string> | string)) {
    if (typeof authors === 'string') {
      authors = [authors];
    }
    this._authors = authors;
  }

  get $repository() {
    return this._getProperty('_repository');
  }

  set $repository(repository: ?string) {
    this._repository = repository;
  }

  get $license() {
    return this._getProperty('_license');
  }

  set $license(license: ?string) {
    this._license = license;
  }

  get $implementation() {
    return this._getProperty('_implementation');
  }

  set $implementation(implementation: ?string) {
    this._implementation = implementation;
  }

  get $runtime() {
    return this._getProperty('_runtime');
  }

  set $runtime(runtime: ?(string | Runtime)) {
    if (typeof runtime === 'string') {
      runtime = Runtime.create(runtime);
    }
    this._runtime = runtime;
  }

  $serialize({omitId} = {}) {
    let result = {};

    if (!omitId && this._id !== undefined) {
      result.$id = this._id;
    }

    let aliases = this._aliases;
    if (aliases !== undefined) {
      aliases = Array.from(aliases);
      if (aliases.length === 1) {
        result.$alias = aliases[0];
      } else if (aliases.length > 1) {
        result.$aliases = aliases;
      }
    }

    if (this._version !== undefined) {
      result.$version = this._version.toJSON();
    }

    if (this._description !== undefined) {
      result.$description = this._description;
    }

    const authors = this._authors;
    if (authors !== undefined) {
      if (authors.length === 1) {
        result.$author = authors[0];
      } else if (authors.length > 1) {
        result.$authors = authors;
      }
    }

    if (this._repository !== undefined) {
      result.$repository = this._repository;
    }

    if (this._license !== undefined) {
      result.$license = this._license;
    }

    if (this._implementation !== undefined) {
      result.$implementation = this._implementation;
    }

    if (this._runtime !== undefined) {
      result.$runtime = this._runtime.toJSON();
    }

    if (isEmpty(result)) {
      result = undefined;
    }

    return result;
  }
}

export default Resource;
