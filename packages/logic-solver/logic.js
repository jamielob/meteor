Logic = {};

// WholeNumber: a non-negative integer (0 is allowed)
Logic.WholeNumber = Match.Where(function (x) {
  check(x, Match.Integer);
  return x >= 0;
});

// Term: a variable name or variable number, optionally
// negated (meaning "boolean not").  For example,
// `1`, `-1`, `"foo"`, or `"-foo"`.  All variables have
// internal numbers that start at 1, so "foo" might be
// variable number 1, for example.  Any number of leading
// "-" will be parsed in the string form, but we try to
// keep it to either one or zero of them.
Logic.Term = Match.Where(function (x) {
  if (typeof x === 'number') {
    check(x, Match.Integer);
    return (x !== 0);
  } else {
    check(x, String);
    return !! x;
  }
});

// A Term that is represented as a number, not a name.
// (Subtype of Term.)
Logic.NTerm = Match.Where(function (x) {
  check(x, Match.Integer);
  return (x !== 0);
});

Logic.not = function (term) {
  check(term, Logic.Term);
  if (typeof term === 'number') {
    return -term;
  } else if (term.charAt(0) === '-') {
    return term.slice(1);
  } else {
    return '-' + term;
  }
};

Logic.Formula = function () {};
// Returns a list of clauses that together require the
// Formula to be true.  (Does not add them to the solver.)
Logic.Formula.prototype._genTrue = function (solver) { return []; };
// Returns a list of clauses that together require the
// Formula to be false.
Logic.Formula.prototype._genFalse = function (solver) { return []; };
// All Formulas have a globally-unique id so that Solvers can track them.
// It is assigned lazily.
Logic.Formula._nextGuid = 1;
Logic.Formula.prototype._guid = null;
Logic.Formula.prototype.guid = function () {
  if (this._guid === null) {
    this._guid = Logic.Formula._nextGuid++;
  }
  return this._guid;
};

// Like `formula._genTrue(solver)` but works on Terms too (in effect
// promoting them to formulas).
Logic.Formula._genTrue = function (formula, solver) {
  if (formula instanceof Logic.Formula) {
    return formula._genTrue(solver);
  } else if (Match.test(formula, Logic.Term)) {
    var t = solver._toN(formula);
    return [new Logic.Clause([t])];
  } else {
    throw new Error("Expected a Formula or Term");
  }
};

Logic.Formula._genFalse = function (formula, solver) {
  if (formula instanceof Logic.Formula) {
    return formula._genFalse(solver);
  } else if (Match.test(formula, Logic.Term)) {
    var t = solver._toN(formula);
    return [new Logic.Clause([-t])];
  } else {
    throw new Error("Expected a Formula or Term");
  }
};

Logic.Clause = function (termOrArray/*, ...*/) {
  var terms = _.flatten(arguments);
  check(terms, [Logic.NTerm]);
  this.terms = terms; // immutable [NTerm]
};

// Returns a new Clause with the extra term or terms appended
Logic.Clause.prototype.append = function (termOrArray/*, ...*/) {
  return new Logic.Clause(this.terms.concat(_.flatten(arguments)));
};

Logic.Solver = function () {
  this.clauses = []; // mutable [Clause]
  this._num2name = [null]; // no 0th var
  this._name2num = {}; // (' '+vname) -> vnum

  // true and false
  this._F = this.getVarNum("`F", true); // 1
  this._T = this.getVarNum("`T", true); // 2
  this._F_used = false;
  this._T_used = false;
  // (it's important that these clauses are elements 0 and 1
  // of the clauses array)
  this.clauses.push(new Logic.Clause(-this._F));
  this.clauses.push(new Logic.Clause(this._T));

  this._formulaInfo = {}; // Formula guid -> info object
};

// Get a var number for vname, assigning it a number if it is new.
Logic.Solver.prototype.getVarNum = function (vname, _internal) {
  var key = ' '+vname;
  if (_.has(this._name2num, key)) {
    return this._name2num[key];
  } else {
    if (vname.charAt(0) === "`" && ! _internal) {
      throw new Error("Only generated variable names can start with `");
    }
    var vnum = this._num2name.length;
    this._name2num[key] = vnum;
    this._num2name.push(vname);
    return vnum;
  }
};

Logic.Solver.prototype.getVarName = function (vnum) {
  var num2name = this._num2name;
  if (vnum < 1 || vnum >= num2name.length) {
    throw new Error("Bad variable num: " + vnum);
  } else {
    return num2name[vnum];
  }
};

// Converts Terms to NTerms (if they aren't already).  This is done
// when a Formula creates Clauses for a Solver, since Clauses require
// NTerms.  Takes a Term or an array.  For example, [-3, "-foo"] might
// become [-3, -4].
Logic.Solver.prototype._toN = function (t) {
  var self = this;

  if (_.isArray(t)) {
    check(t, [Logic.Term]);
    return _.map(t, function (tt) {
      return self._toN(tt);
    });
  } else {
    check(t, Logic.Term);
  }

  if (typeof t === 'number') {
    return t;
  } else { // string
    var not = false;
    while (t.charAt(0) === '-') {
      t = t.slice(1);
      not = ! not;
    }
    var n = self.getVarNum(t);
    return (not ? -n : n);
  }
};

// Converts Terms to string form.
Logic.Solver.prototype._toName = function (t) {
  var self = this;

  if (_.isArray(t)) {
    check(t, [Logic.Term]);
    return _.map(t, function (tt) {
      return self._toName(tt);
    });
  } else {
    check(t, Logic.Term);
  }

  if (typeof t === 'string') {
    // canonicalize, removing leading "--"
    while (t.slice(0, 2) == '--') {
      t = t.slice(2);
    }
    return t;
  } else { // number
    var not = false;
    if (t < 0) {
      not = true;
      t = -t;
    }
    t = self.getVarName(t);
    if (not) {
      t = '-' + t;
    }
    return t;
  }
};

Logic.Solver.prototype._addClause = function (cls) {
  check(cls, Logic.Clause);

  if (_.contains(cls.terms, 1)) {
    this._F_used = true;
  }
  if (_.contains(cls.terms, 2)) {
    this._T_used = true;
  }
  this.clauses.push(cls);
};

Logic.Solver.prototype._addClauses = function (array) {
  check(array, [Logic.Clause]);
  var self = this;
  _.each(array, function (cls) { self._addClause(cls); });
};

Logic.Solver.prototype.require = function (formulaOrArray/*, ...*/) {
  var self = this;
  _.each(_.flatten(arguments), function (f) {
    self._addClauses(Logic.Formula._genTrue(f, self));
  });
};

Logic.Solver.prototype.forbid = function (formulaOrArray/*, ...*/) {
  var self = this;
  _.each(_.flatten(arguments), function (f) {
    self._addClauses(Logic.Formula._genFalse(f, self));
  });
};

// Get clause data as an array of arrays of integers,
// for testing and debugging purposes.
Logic.Solver.prototype._clauseData = function () {
  var clauses = _.pluck(this.clauses, 'terms');
  if (! this._T_used) {
    clauses.splice(1, 1);
  }
  if (! this._F_used) {
    clauses.splice(0, 1);
  }
  return clauses;
};

// Get clause data as an array of human-readable strings,
// for testing and debugging purposes.
// A clause might look like "A v -B" (where "v" represents
// and OR operator).
Logic.Solver.prototype._clauseStrings = function () {
  var self = this;
  var clauseData = self._clauseData();
  return _.map(clauseData, function (clause) {
    return _.map(clause, function (nterm) {
      var str = self._toName(nterm);
      if (/\s/.test(str)) {
        // write name in quotes for readability.  we don't bother
        // making this string machine-parsable in the general case.
        var sign = '';
        if (str.charAt(0) === '-') {
          // temporarily remove '-'
          sign = '-';
          str = str.slice(1);
        }
        str = sign + '"' + str + '"';
      }
      return str;
    }).join(' v ');
  });
};

Logic.Solver.prototype._getFormulaInfo = function (formula) {
  var self = this;
  var guid = formula.guid();
  if (! self._formulaInfo[guid]) {
    self._formulaInfo[guid] = {
      // We generate a variable when a Formula is used that has
      // not been explicitly required or forbidden.  If the variable
      // is only used positively or only used negatively, we can
      // generate fewer clauses, using a method that relies on
      // the fact that the generated variable is unobservable so we
      // can get away without a bidirectional implication.
      isRequired: false,
      isForbidden: false,
      variable: null,
      occursPositively: false,
      occursNegatively: false
    };
  }
  return self._formulaInfo[guid];
};

Logic._defineFormula = function (constructor, typeName, methods) {
  check(constructor, Function);
  check(typeName, String);
  Meteor._inherits(constructor, Logic.Formula);
  constructor.prototype.type = typeName;
  if (methods) {
    _.extend(constructor.prototype, methods);
  }
};

Logic.or = function (termOrArray/*, ...*/) {
  return new Logic.OrFormula(_.flatten(arguments));
};

Logic.OrFormula = function (terms) {
  check(terms, [Logic.Term]);
  this.terms = terms;
};

Logic._defineFormula(Logic.OrFormula, 'or', {
  _genTrue: function (solver) {
    return [new Logic.Clause(solver._toN(this.terms))];
  },
  _genFalse: function (solver) {
    return _.map(this.terms, function (t) {
      return new Logic.Clause(-solver._toN(t));
    });
  }
});
