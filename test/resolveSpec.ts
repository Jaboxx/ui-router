import * as angular from 'angular';
import './util/matchers';
import './util/testUtilsNg1';

declare var inject;
import Spy = jasmine.Spy;
import './util/matchers';
import { resolvedValue, resolvedError, caught } from './util/testUtilsNg1';
import { ResolveContext, StateObject, PathNode, omit, pick, inherit, forEach } from '@uirouter/core';
import { UIRouter, Resolvable, services, StateDeclaration } from '@uirouter/core';
import '../src/legacy/resolveService';

const module = angular['mock'].module;
///////////////////////////////////////////////

let states,
  statesTree,
  statesMap: { [key: string]: StateObject } = {};
let emptyPath;
let vals, counts, expectCounts;
let asyncCount;

function invokeLater(fn: Function, ctx: ResolveContext) {
  return new Resolvable('', fn, services.$injector.annotate(fn)).get(ctx);
}

function getStates() {
  return {
    A: {
      resolve: {
        _A: function() {
          return 'A';
        },
        _A2: function() {
          return 'A2';
        },
      },
      B: {
        resolve: {
          _B: function() {
            return 'B';
          },
          _B2: function() {
            return 'B2';
          },
        },
        C: {
          resolve: {
            _C: function(_A, _B) {
              return _A + _B + 'C';
            },
            _C2: function() {
              return 'C2';
            },
          },
          D: {
            resolve: {
              _D: function(_D2) {
                return 'D1' + _D2;
              },
              _D2: function() {
                return 'D2';
              },
            },
          },
        },
      },
      E: {
        resolve: {
          _E: function() {
            return 'E';
          },
        },
        F: {
          resolve: {
            _E: function() {
              return '_E';
            },
            _F: function(_E) {
              return _E + 'F';
            },
          },
        },
      },
      G: {
        resolve: {
          _G: function() {
            return 'G';
          },
        },
        H: {
          resolve: {
            _G: function(_G) {
              return _G + '_G';
            },
            _H: function(_G) {
              return _G + 'H';
            },
          },
        },
      },
      I: {
        resolve: {
          _I: function(_I) {
            return 'I';
          },
        },
      },
    },
    J: {
      resolve: {
        _J: function() {
          counts['_J']++;
          return 'J';
        },
        _J2: function(_J) {
          counts['_J2']++;
          return _J + 'J2';
        },
      },
      K: {
        resolve: {
          _K: function(_J2) {
            counts['_K']++;
            return _J2 + 'K';
          },
        },
        L: {
          resolve: {
            _L: function(_K) {
              counts['_L']++;
              return _K + 'L';
            },
          },
          M: {
            resolve: {
              _M: function(_L) {
                counts['_M']++;
                return _L + 'M';
              },
            },
          },
        },
      },
    },
    O: {
      resolve: {
        _O: function(_O2) {
          return _O2 + 'O';
        },
        _O2: function(_O) {
          return _O + 'O2';
        },
      },
    },
    P: {
      resolve: {
        $state: function($state) {
          return $state;
        },
      },
      Q: {
        resolve: {
          _Q: function($state) {
            counts._Q++;
            vals._Q = $state;
            return 'foo';
          },
        },
      },
    },
    PAnnotated: {
      resolve: {
        $state: [
          '$state',
          function($state) {
            return $state;
          },
        ],
      },
    },
  };
}

beforeEach(function() {
  counts = { _J: 0, _J2: 0, _K: 0, _L: 0, _M: 0, _Q: 0 };
  vals = { _Q: null };
  expectCounts = angular.copy(counts);
  states = getStates();

  const stateProps = ['resolve', 'resolvePolicy'];
  statesTree = loadStates({}, states, '');

  function loadStates(parent, state, name) {
    let thisState: any = pick(state, stateProps);
    const substates: any = omit(state, stateProps);

    thisState.template = thisState.template || 'empty';
    thisState.name = name;
    thisState.parent = parent.name;
    thisState.params = {};
    thisState.data = { children: [] };

    angular.forEach(substates, function(value, key) {
      thisState.data.children.push(loadStates(thisState, value, key));
    });
    thisState = StateObject.create(thisState);
    statesMap[name] = thisState;
    return thisState;
  }
});

function makePath(names: string[]): PathNode[] {
  return names.map(name => new PathNode(statesMap[name]));
}

describe('Resolvables system:', function() {
  beforeEach(
    inject(function($transitions, $injector) {
      emptyPath = [];
      asyncCount = 0;
    })
  );

  describe('strictDi support', function() {
    let originalStrictDi: boolean;
    let supportsStrictDi = false;

    beforeEach(
      inject(function($injector) {
        // not all angular versions support strictDi mode.
        // here, we detect the feature
        try {
          $injector.annotate(() => {}, true);
        } catch (e) {
          supportsStrictDi = true;
        }

        if (supportsStrictDi) {
          originalStrictDi = $injector.strictDi;
          $injector.strictDi = true;
        }
      })
    );

    afterEach(
      inject(function($injector) {
        if (supportsStrictDi) {
          $injector.strictDi = originalStrictDi;
        }
      })
    );

    it(
      'should throw when creating a resolvable with an unannotated fn and strictDi mode on',
      inject(function($injector) {
        if (supportsStrictDi) {
          expect(() => {
            makePath(['P']);
          }).toThrowError(/strictdi/);
        }
      })
    );

    it(
      'should not throw when creating a resolvable with an annotated fn and strictDi mode on',
      inject(function($injector) {
        if (supportsStrictDi) {
          expect(() => {
            makePath(['PAnnotated']);
          }).not.toThrowError(/strictdi/);
        }
      })
    );
  });
});

describe('$resolve', function() {
  let $r, tick;

  beforeEach(module('ui.router'));
  beforeEach(
    module(function($provide, $exceptionHandlerProvider) {
      $exceptionHandlerProvider.mode('log'); // Don't rethrow from a promise
      $provide.factory('Foo', function() {
        return 'Working';
      });
    })
  );

  beforeEach(
    inject(function($resolve, $q) {
      $r = $resolve;
      tick = $q.flush;
    })
  );

  describe('.resolve()', function() {
    it('calls injectable functions and returns a promise', function() {
      const fun: Spy = jasmine.createSpy('fun');
      fun.and.returnValue(42);
      const r = $r.resolve({ fun: ['$resolve', fun] });
      expect(r).not.toBeResolved();
      tick();
      expect(resolvedValue(r)).toEqual({ fun: 42 });
      expect(fun).toHaveBeenCalled();
      expect(fun.calls.count()).toBe(1);
      expect(fun.calls.mostRecent().args.length).toBe(1);
      expect(fun.calls.mostRecent().args[0]).toBe($r);
    });

    it(
      'resolves promises returned from the functions',
      inject(function($q) {
        const d = $q.defer();
        const fun = jasmine.createSpy('fun').and.returnValue(d.promise);
        const r = $r.resolve({ fun: ['$resolve', fun] });
        tick();
        expect(r).not.toBeResolved();
        d.resolve('async');
        tick();
        expect(resolvedValue(r)).toEqual({ fun: 'async' });
      })
    );

    it('resolves dependencies between functions', function() {
      const a = jasmine.createSpy('a');
      const b = jasmine.createSpy('b').and.returnValue('bb');
      const r = $r.resolve({ a: ['b', a], b: [b] });
      tick();
      expect(a).toHaveBeenCalled();
      expect(a.calls.mostRecent().args).toEqual(['bb']);
      expect(b).toHaveBeenCalled();
    });

    it(
      'resolves dependencies between functions that return promises',
      inject(function($q) {
        const ad = $q.defer(),
          a = jasmine.createSpy('a');
        a.and.returnValue(ad.promise);
        const bd = $q.defer(),
          b = jasmine.createSpy('b');
        b.and.returnValue(bd.promise);
        const cd = $q.defer(),
          c = jasmine.createSpy('c');
        c.and.returnValue(cd.promise);

        const r = $r.resolve({ a: ['b', 'c', a], b: ['c', b], c: [c] });
        tick();
        expect(r).not.toBeResolved();
        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
        expect(c).toHaveBeenCalled();
        cd.resolve('cc');
        tick();
        expect(r).not.toBeResolved();
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalled();
        expect(b.calls.mostRecent().args).toEqual(['cc']);
        bd.resolve('bb');
        tick();
        expect(r).not.toBeResolved();
        expect(a).toHaveBeenCalled();
        expect(a.calls.mostRecent().args).toEqual(['bb', 'cc']);
        ad.resolve('aa');
        tick();
        expect(resolvedValue(r)).toEqual({ a: 'aa', b: 'bb', c: 'cc' });
        expect(a.calls.count()).toBe(1);
        expect(b.calls.count()).toBe(1);
        expect(c.calls.count()).toBe(1);
      })
    );

    // TODO: Reimplement cycle detection
    xit('refuses cyclic dependencies', function() {
      const a = jasmine.createSpy('a');
      const b = jasmine.createSpy('b');
      expect(
        caught(function() {
          $r.resolve({ a: ['b', a], b: ['a', b] });
        })
      ).toMatch(/cyclic/i);
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it('allows a function to depend on an injector value of the same name', function() {
      const r = $r.resolve({
        $resolve: function($resolve) {
          return $resolve === $r;
        },
      });
      tick();
      expect(resolvedValue(r)).toEqual({ $resolve: true });
    });

    it('allows locals to be passed that override the injector', function() {
      const fun = jasmine.createSpy('fun');
      $r.resolve({ fun: ['$resolve', fun] }, { $resolve: 42 });
      tick();
      expect(fun).toHaveBeenCalled();
      expect(fun.calls.mostRecent().args[0]).toBe(42);
    });

    it('does not call injectables overridden by a local', function() {
      const fun = jasmine.createSpy('fun').and.returnValue('function');
      const r = $r.resolve({ fun: [fun] }, { fun: 'local' });
      tick();
      expect(fun).not.toHaveBeenCalled();
      expect(resolvedValue(r)).toEqual({ fun: 'local' });
    });

    it('includes locals in the returned values', function() {
      const locals = { foo: 'hi', bar: 'mom' };
      const r = $r.resolve({}, locals);
      tick();
      expect(resolvedValue(r)).toEqual(locals);
    });

    it('allows inheritance from a parent resolve()', function() {
      const r = $r.resolve({
        fun: function() {
          return true;
        },
      });
      const s = $r.resolve(
        {
          games: function() {
            return true;
          },
        },
        {},
        r
      );
      tick();
      expect(r).toBeResolved();
      expect(resolvedValue(s)).toEqual({ fun: true, games: true });
    });

    it('resolves dependencies from a parent resolve()', function() {
      const r = $r.resolve({
        a: [
          function() {
            return 'aa';
          },
        ],
      });
      const b = jasmine.createSpy('b');
      const s = $r.resolve({ b: ['a', b] }, {}, r);
      tick();
      expect(b).toHaveBeenCalled();
      expect(b.calls.mostRecent().args).toEqual(['aa']);
    });

    it(
      'allow access to ancestor resolves in descendent resolve blocks',
      inject(function($q) {
        const gPromise = $q.defer(),
          gInjectable = jasmine.createSpy('gInjectable').and.returnValue(gPromise.promise),
          pPromise = $q.defer(),
          pInjectable = jasmine.createSpy('pInjectable').and.returnValue(pPromise.promise);

        const g = $r.resolve({ gP: [gInjectable] });

        gPromise.resolve('grandparent');
        tick();

        const s = jasmine.createSpy('s');
        const p = $r.resolve({ p: [pInjectable] }, {}, g);
        const c = $r.resolve({ c: ['p', 'gP', s] }, {}, p);

        pPromise.resolve('parent');
        tick();

        expect(s).toHaveBeenCalled();
        expect(s.calls.mostRecent().args).toEqual(['parent', 'grandparent']);
      })
    );

    // test for #1353
    it(
      'allow parent resolve to override grandparent resolve',
      inject(function($q) {
        const gPromise = $q.defer(),
          gInjectable = jasmine.createSpy('gInjectable').and.returnValue(gPromise.promise);

        const g = $r.resolve({
          item: [
            function() {
              return 'grandparent';
            },
          ],
        });
        gPromise.resolve('grandparent');
        tick();

        const p = $r.resolve(
          {
            item: [
              function() {
                return 'parent';
              },
            ],
          },
          {},
          g
        );
        const s = jasmine.createSpy('s');
        const c = $r.resolve({ c: [s] }, {}, p);
        let item;
        c.then(function(vals) {
          item = vals.item;
        });
        tick();

        expect(s).toHaveBeenCalled();
        expect(item).toBe('parent');
      })
    );

    it('allows a function to override a parent value of the same name', function() {
      const r = $r.resolve({
        b: function() {
          return 'B';
        },
      });
      const s = $r.resolve(
        {
          a: function(b) {
            return 'a:' + b;
          },
          b: function(b) {
            return '(' + b + ')';
          },
          c: function(b) {
            return 'c:' + b;
          },
        },
        {},
        r
      );
      tick();
      expect(resolvedValue(s)).toEqual({ a: 'a:(B)', b: '(B)', c: 'c:(B)' });
    });

    it(
      'allows a function to override a parent value of the same name with a promise',
      inject(function($q) {
        const r = $r.resolve({
          b: function() {
            return 'B';
          },
        });
        let superb,
          bd = $q.defer();
        const s = $r.resolve(
          {
            a: function(b) {
              return 'a:' + b;
            },
            b: function(b) {
              superb = b;
              return bd.promise;
            },
            c: function(b) {
              return 'c:' + b;
            },
          },
          {},
          r
        );
        tick();
        bd.resolve('(' + superb + ')');
        tick();
        expect(resolvedValue(s)).toEqual({ a: 'a:(B)', b: '(B)', c: 'c:(B)' });
      })
    );

    it(
      'it only resolves after the parent resolves',
      inject(function($q) {
        const bd = $q.defer(),
          b = jasmine.createSpy('b').and.returnValue(bd.promise);
        const cd = $q.defer(),
          c = jasmine.createSpy('c').and.returnValue(cd.promise);
        const r = $r.resolve({ c: [c] });
        const s = $r.resolve({ b: [b] }, {}, r);
        bd.resolve('bbb');
        tick();
        expect(r).not.toBeResolved();
        expect(s).not.toBeResolved();
        cd.resolve('ccc');
        tick();
        expect(resolvedValue(r)).toEqual({ c: 'ccc' });
        expect(resolvedValue(s)).toEqual({ b: 'bbb', c: 'ccc' });
      })
    );

    it('rejects missing dependencies but does not fail synchronously', function() {
      const r = $r.resolve({ fun: function(invalid) {} });
      expect(r).not.toBeResolved();
      tick();
      expect(resolvedError(r)).toMatch(/unknown provider/i);
    });

    it('propagates exceptions thrown by the functions as a rejection', function() {
      const r = $r.resolve({
        fun: function() {
          throw 'i want cake';
        },
      });
      expect(r).not.toBeResolved();
      tick();
      expect(resolvedError(r)).toBe('i want cake');
    });

    it('propagates errors from a parent resolve', function() {
      const error = ['the cake is a lie'];
      const r = $r.resolve({
        foo: function() {
          throw error;
        },
      });
      const s = $r.resolve(
        {
          bar: function() {
            42;
          },
        },
        r
      );
      tick();
      expect(resolvedError(r)).toBe(error);
      expect(resolvedError(s)).toBe(error);
    });

    it('does not invoke any functions if the parent resolve has already failed', function() {
      const r = $r.resolve({
        foo: function() {
          throw 'oops';
        },
      });
      tick();
      expect(r).toBeResolved();
      const a = jasmine.createSpy('a');
      const s = $r.resolve({ a: [a] }, {}, r);
      tick();
      expect(resolvedError(s)).toBeDefined();
      expect(a).not.toHaveBeenCalled();
    });

    // TODO: Resolvables don't do this; the $resolve service used to.  Possibly reimplement this short-circuit.
    xit(
      'does not invoke any more functions after a failure',
      inject(function($q) {
        const ad = $q.defer(),
          a = jasmine.createSpy('a').and.returnValue(ad.promise);
        const cd = $q.defer(),
          c = jasmine.createSpy('c').and.returnValue(cd.promise);
        const dd = $q.defer(),
          d = jasmine.createSpy('d').and.returnValue(dd.promise);
        const r = $r.resolve({ a: ['c', a], c: [c], d: [d] });
        dd.reject('dontlikeit');
        tick();
        expect(resolvedError(r)).toBeDefined();
        cd.resolve('ccc');
        tick();
        expect(a).not.toHaveBeenCalled();
      })
    );

    it(
      'does not invoke any more functions after a parent failure',
      inject(function($q) {
        const ad = $q.defer(),
          a = jasmine.createSpy('a').and.returnValue(ad.promise);
        const cd = $q.defer(),
          c = jasmine.createSpy('c').and.returnValue(cd.promise);
        const dd = $q.defer(),
          d = jasmine.createSpy('d').and.returnValue(dd.promise);
        const r = $r.resolve({ c: [c], d: [d] });
        const s = $r.resolve({ a: ['c', a] }, r);
        dd.reject('dontlikeit');
        tick();
        expect(resolvedError(r)).toBeDefined();
        expect(resolvedError(s)).toBeDefined();
        cd.resolve('ccc');
        tick();
        expect(a).not.toHaveBeenCalled();
      })
    );
  });
});

// Integration tests
describe('Integration: Resolvables system', () => {
  beforeEach(
    module(function() {
      const app = angular.module('test', ['ui.router']);
      if (angular.version.minor >= 5) {
        app.component('nowait', {
          bindings: { wait: '<', nowait: '<' },
          template: '{{ $ctrl.wait }}-{{ $ctrl.data }}',
          controller: function() {
            this.$onInit = () => {
              this.nowait.then(result => (this.data = result));
            };
          },
        });
      }
    })
  );

  beforeEach(
    module(function($stateProvider) {
      const copy = {};
      forEach(statesMap, (stateDef, name) => {
        copy[name] = stateDef;
      });

      angular.forEach(copy, (stateDef: StateObject) => {
        if (stateDef.name) $stateProvider.state(stateDef.self);
      });
    })
  );

  beforeEach(module('test'));

  let router: UIRouter, $state, $rootScope, $transitions, $trace, $q;
  beforeEach(
    inject((_$uiRouter_, _$state_, _$rootScope_, _$transitions_, _$trace_, _$q_) => {
      router = _$uiRouter_;
      $state = _$state_;
      $rootScope = _$rootScope_;
      $transitions = _$transitions_;
      $trace = _$trace_;
      $q = _$q_;
    })
  );

  it('should not re-resolve data, when redirecting to a child', () => {
    $transitions.onStart({ to: 'J' }, $transition$ => {
      const ctx = new ResolveContext($transition$.treeChanges().to);
      return invokeLater(function(_J) {}, ctx).then(function() {
        expect(counts._J).toEqualData(1);
        return $state.target('K');
      });
    });
    $state.go('J');
    $rootScope.$digest();
    expect($state.current.name).toBe('K');
    expect(counts._J).toEqualData(1);
  });

  // Test for https://github.com/angular-ui/ui-router/issues/3546
  it('should not inject child data into parent', () => {
    let injectedData;
    router.stateRegistry.register({
      name: 'foo',
      resolve: {
        myresolve: () => 'foodata',
      },
      onEnter: myresolve => (injectedData = myresolve),
    });

    router.stateRegistry.register({
      name: 'foo.bar',
      resolve: {
        myresolve: () => 'bardata',
      },
    });

    $state.go('foo.bar');
    $rootScope.$digest();

    expect($state.current.name).toBe('foo.bar');
    expect(injectedData).toBe('foodata');
  });

  it(
    'should inject a promise for NOWAIT resolve into a controller',
    inject(function($compile, $rootScope) {
      const scope = $rootScope.$new();
      const el = $compile('<div><ui-view></ui-view></div>')(scope);

      const deferWait = $q.defer();
      const deferNowait = $q.defer();
      let onEnterNowait;

      router.stateProvider.state({
        name: 'policies',
        resolve: [
          { token: 'nowait', resolveFn: () => deferNowait.promise, policy: { async: 'NOWAIT' } },
          { token: 'wait', resolveFn: () => deferWait.promise },
        ],
        onEnter: function(nowait) {
          onEnterNowait = nowait;
        },
        controller: function($scope, wait, nowait) {
          $scope.wait = wait;
          nowait.then(result => ($scope.nowait = result));
        },
        template: '{{ wait }}-{{ nowait }}',
      });

      $state.go('policies');
      $q.flush();

      expect($state.current.name).toBe('');

      deferWait.resolve('wait for this');
      $q.flush();

      expect($state.current.name).toBe('policies');
      expect(el.text()).toBe('wait for this-');
      expect(typeof onEnterNowait.then).toBe('function');

      deferNowait.resolve('dont wait for this');
      $q.flush();

      expect(el.text()).toBe('wait for this-dont wait for this');
    })
  );

  if (angular.version.minor >= 5) {
    it(
      'should bind a promise for NOWAIT resolve onto a component controller',
      inject(function($compile, $rootScope) {
        const scope = $rootScope.$new();
        const el = $compile('<div><ui-view></ui-view></div>')(scope);

        const deferWait = $q.defer();
        const deferNowait = $q.defer();

        router.stateProvider.state({
          name: 'policies',
          resolve: [
            { token: 'nowait', resolveFn: () => deferNowait.promise, policy: { async: 'NOWAIT' } },
            { token: 'wait', resolveFn: () => deferWait.promise },
          ],
          component: 'nowait',
        });

        $state.go('policies');
        $q.flush();

        expect($state.current.name).toBe('');

        deferWait.resolve('wait for this');
        $q.flush();

        expect($state.current.name).toBe('policies');
        expect(el.text()).toBe('wait for this-');

        deferNowait.resolve('dont wait for this');
        $q.flush();

        expect(el.text()).toBe('wait for this-dont wait for this');
      })
    );
  }
});
