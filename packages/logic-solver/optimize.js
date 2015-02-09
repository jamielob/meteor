var minMax = function (solver, solution, costTerms, costWeights, options, isMin) {
  var curSolution = solution;
  var curCost = curSolution.getWeightedSum(costTerms, costWeights);

  var optFormula = options && options.formula;
  var weightedSum = (optFormula || Logic.weightedSum(costTerms, costWeights));

  var progress = options && options.progress;

  while (isMin ? curCost > 0 : true) {
    if (progress) {
      progress('improving', curCost);
    }
    var improvement = (isMin ? Logic.lessThan : Logic.greaterThan)(
      weightedSum, Logic.constantBits(curCost));
    var newSolution = solver.solveAssuming(improvement);
    if (! newSolution) {
      break;
    }
    solver.require(improvement);
    curSolution = newSolution;
    curCost = curSolution.getWeightedSum(costTerms, costWeights);
  }

  solver.require((isMin ? Logic.lessThanOrEqual : Logic.greaterThanOrEqual)(
    weightedSum, Logic.constantBits(curCost)));

  if (progress) {
    progress('finished', curCost);
  }

  return curSolution;
};

// Minimize (or maximize) the dot product of costTerms and costWeights,
// and require that the value of the dot product be the optimum.
//
// costWeights is an array (of same length as costTerms) or a single WholeNumber.
//
// if the caller passes optFormula, it should be the formula
// Logic.weightedSum(costTerms, costWeights).  The optimizer will use
// this existing formula rather than generating a new one (for efficiency).
// The optimizer still wants to know the terms and weights, because it is
// more efficient for it to evaluate the current cost using them directly
// rather than the formula.

Logic.Solver.prototype.minimize = function (solution, costTerms, costWeights, options) {
  return minMax(this, solution, costTerms, costWeights, options, true);
};

Logic.Solver.prototype.maximize = function (solution, costTerms, costWeights, options) {
  return minMax(this, solution, costTerms, costWeights, options, false);
};