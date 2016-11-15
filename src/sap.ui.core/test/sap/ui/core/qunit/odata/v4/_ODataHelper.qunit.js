/*!
 * ${copyright}
 */
sap.ui.require([
	"jquery.sap.global",
	"sap/ui/model/Context",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/odata/v4/_ODataHelper",
	"sap/ui/model/odata/v4/lib/_Cache",
	"sap/ui/model/odata/v4/lib/_Helper",
	"sap/ui/model/odata/v4/lib/_Parser",
	"sap/ui/model/odata/v4/lib/_SyncPromise",
	"sap/ui/model/Sorter"
], function (jQuery, Context, Filter, FilterOperator, _ODataHelper, _Cache, _Helper, _Parser,
		_SyncPromise, Sorter) {
	/*global QUnit, sinon */
	/*eslint no-warning-comments: 0, max-nested-callbacks: 0 */
	"use strict";

	/**
	 * Clones the given object
	 *
	 * @param {any} v the object
	 * @returns {any} the clone
	 */
	function clone(v) {
		return v && JSON.parse(JSON.stringify(v));
	}

	//*********************************************************************************************
	QUnit.module("sap.ui.model.odata.v4._ODataHelper", {
		beforeEach : function () {
			this.oLogMock = sinon.mock(jQuery.sap.log);
			this.oLogMock.expects("warning").never();
			this.oLogMock.expects("error").never();
		},

		afterEach : function () {
			this.oLogMock.verify();
		}
	});

	//*********************************************************************************************
	[{
		sKeyPredicate : "('42')",
		oEntityInstance : {"ID" : "42"},
		oEntityType : {
			"$Key" : ["ID"],
			"ID" : {
				"$Type" : "Edm.String"
			}
		}
	}, {
		sKeyPredicate : "('Walter%22s%20Win''s')",
		oEntityInstance : {"ID" : "Walter\"s Win's"},
		oEntityType : {
			"$Key" : ["ID"],
			"ID" : {
				"$Type" : "Edm.String"
			}
		}
	}, {
		sKeyPredicate : "(Sector='DevOps',ID='42')",
		oEntityInstance : {"ID" : "42", "Sector" : "DevOps"},
		oEntityType : {
			"$Key" : ["Sector", "ID"],
			"Sector" : {
				"$Type" : "Edm.String"
			},
			"ID" : {
				"$Type" : "Edm.String"
			}
		}
	}, {
		sKeyPredicate : "(Bar=42,Fo%3Do='Walter%22s%20Win''s')",
		oEntityInstance : {
			"Bar" : 42,
			"Fo=o" : "Walter\"s Win's"
		},
		oEntityType : {
			"$Key" : ["Bar", "Fo=o"],
			"Bar" : {
				"$Type" : "Edm.Int16"
			},
			"Fo=o" : {
				"$Type" : "Edm.String"
			}
		}
	}].forEach(function (oFixture) {
		QUnit.test("getKeyPredicate: " + oFixture.sKeyPredicate, function (assert) {
			var sProperty;

			this.spy(_Helper, "formatLiteral");

			assert.strictEqual(
				_ODataHelper.getKeyPredicate(oFixture.oEntityType, oFixture.oEntityInstance),
				oFixture.sKeyPredicate);

			// check that _Helper.formatLiteral() is called for each property
			for (sProperty in oFixture.oEntityType) {
				if (sProperty[0] !== "$") {
					assert.ok(
						_Helper.formatLiteral.calledWithExactly(
							oFixture.oEntityInstance[sProperty],
							oFixture.oEntityType[sProperty].$Type),
						_Helper.formatLiteral.printf(
							"_Helper.formatLiteral('" + sProperty + "',...) %C"));
				}
			}
		});
	});
	//TODO handle keys with aliases!

	//*********************************************************************************************
	[{
		sDescription : "one key property",
		oEntityInstance : {},
		oEntityType : {
			"$Key" : ["ID"],
			"ID" : {
				"$Type" : "Edm.String"
			}
		}
	}, {
		sDescription : "multiple key properties",
		oEntityInstance : {"Sector" : "DevOps"},
		oEntityType : {
			"$Key" : ["Sector", "ID"],
			"Sector" : {
				"$Type" : "Edm.String"
			},
			"ID" : {
				"$Type" : "Edm.String"
			}
		}
	}].forEach(function (oFixture) {
		QUnit.test("getKeyPredicate: missing key, " + oFixture.sDescription, function (assert) {
			var sError = "Missing value for key property 'ID'";

			assert.throws(function () {
				_ODataHelper.getKeyPredicate(oFixture.oEntityType, oFixture.oEntityInstance);
			}, new Error(sError));
		});
	});

	//*********************************************************************************************
	QUnit.test("getKeyPredicate: no instance", function (assert) {
		var sError = "No instance to calculate key predicate";

		assert.throws(function () {
			_ODataHelper.getKeyPredicate({
				$Key : ["ID"]
			}, undefined);
		}, new Error(sError));
	});

	//*********************************************************************************************
	[{
		mModelOptions : {"sap-client" : "111"},
		mOptions : {"$expand" : {"foo" : null}, "$select" : ["bar"], "custom" : "baz"},
		bSystemQueryOptionsAllowed : true
	}, {
		mOptions : {"$apply" : "apply", "$filter" : "foo eq 42", "$orderby" : "bar"},
		bSystemQueryOptionsAllowed : true
	}, {
		mModelOptions : {"custom" : "bar"},
		mOptions : {"custom" : "foo"}
	}, {
		mModelOptions : undefined,
		mOptions : undefined
	}, {
		mModelOptions : null,
		mOptions : {"sap-client" : "111"},
		bSapAllowed : true
	}].forEach(function (o) {
		QUnit.test("buildQueryOptions success " + JSON.stringify(o), function (assert) {
			var mOptions,
				mOriginalModelOptions = clone(o.mModelOptions),
				mOriginalOptions = clone(o.mOptions);

			mOptions = _ODataHelper.buildQueryOptions(o.mModelOptions, o.mOptions,
				o.bSystemQueryOptionsAllowed, o.bSapAllowed);

			assert.deepEqual(mOptions, jQuery.extend({}, o.mModelOptions, o.mOptions));
			assert.deepEqual(o.mModelOptions, mOriginalModelOptions);
			assert.deepEqual(o.mOptions, mOriginalOptions);
		});
	});

	//*********************************************************************************************
	QUnit.test("buildQueryOptions with $$ options", function (assert) {
		assert.deepEqual(_ODataHelper.buildQueryOptions({}, {$$groupId : "$direct"}), {});
	});

	//*********************************************************************************************
	QUnit.test("buildQueryOptions: parse system query options", function (assert) {
		var oExpand = {"foo" : true},
			oParserMock = this.mock(_Parser),
			aSelect = ["bar"];

		oParserMock.expects("parseSystemQueryOption")
			.withExactArgs("$expand=foo").returns({"$expand" : oExpand});
		oParserMock.expects("parseSystemQueryOption")
			.withExactArgs("$select=bar").returns({"$select" : aSelect});

		assert.deepEqual(_ODataHelper.buildQueryOptions({}, {
			$expand : "foo",
			$select : "bar"
		}, true), {
			$expand : oExpand,
			$select : aSelect
		});
	});

	//*********************************************************************************************
	[{
		mModelOptions : {},
		mOptions : {"$foo" : "foo"},
		bSystemQueryOptionsAllowed : true,
		error : "System query option $foo is not supported"
	}, {
		mModelOptions : {},
		mOptions : {"@alias" : "alias"},
		bSystemQueryOptionsAllowed : true,
		error : "Parameter @alias is not supported"
	}, {
		mModelOptions : undefined,
		mOptions : {"$expand" : {"foo" : true}},
		error : "System query option $expand is not supported"
	}, {
		mModelOptions : undefined,
		mOptions : {"$expand" : {"foo" : {"$unknown" : "bar"}}},
		bSystemQueryOptionsAllowed : true,
		error : "System query option $unknown is not supported"
	}, {
		mModelOptions : undefined,
		mOptions : {"$expand" : {"foo" : {"select" : "bar"}}},
		bSystemQueryOptionsAllowed : true,
		error : "System query option select is not supported"
	}, {
		mModelOptions : undefined,
		mOptions : {"sap-foo" : "300"},
		error : "Custom query option sap-foo is not supported"
	}].forEach(function (o) {
		QUnit.test("buildQueryOptions error " + JSON.stringify(o), function (assert) {
			assert.throws(function () {
				_ODataHelper.buildQueryOptions(o.mModelOptions, o.mOptions,
					o.bSystemQueryOptionsAllowed);
			}, new Error(o.error));
		});
	});

	//*********************************************************************************************
	QUnit.test("buildBindingParameters, $$groupId", function (assert) {
		var aAllowedParams = ["$$groupId"];

		assert.deepEqual(_ODataHelper.buildBindingParameters(undefined), {});
		assert.deepEqual(_ODataHelper.buildBindingParameters({}), {});
		assert.deepEqual(_ODataHelper.buildBindingParameters({$$groupId : "$auto"}, aAllowedParams),
			{$$groupId : "$auto"});
		assert.deepEqual(_ODataHelper.buildBindingParameters(
			{$$groupId : "$direct", custom : "foo"}, aAllowedParams), {$$groupId : "$direct"});

		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$unsupported : "foo"});
		}, new Error("Unsupported binding parameter: $$unsupported"));

		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$groupId : ""}, aAllowedParams);
		}, new Error("Unsupported value '' for binding parameter '$$groupId'"));
		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$groupId : "~invalid"}, aAllowedParams);
		}, new Error("Unsupported value '~invalid' for binding parameter '$$groupId'"));
		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$groupId : "$auto"});
		}, new Error("Unsupported binding parameter: $$groupId"));
	});

	//*********************************************************************************************
	QUnit.test("buildBindingParameters, $$operationMode", function (assert) {
		var aAllowedParams = ["$$operationMode"];

		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$operationMode : "Client"}, aAllowedParams);
		}, new Error("Unsupported operation mode: Client"));
		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$operationMode : "Auto"}, aAllowedParams);
		}, new Error("Unsupported operation mode: Auto"));
		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$operationMode : "any"}, aAllowedParams);
		}, new Error("Unsupported operation mode: any"));

		assert.deepEqual(_ODataHelper.buildBindingParameters({$$operationMode : "Server"},
				aAllowedParams),
			{$$operationMode : "Server"});
	});

	//*********************************************************************************************
	QUnit.test("buildBindingParameters, $$updateGroupId", function (assert) {
		var aAllowedParams = ["$$updateGroupId"];

		assert.deepEqual(_ODataHelper.buildBindingParameters({$$updateGroupId : "myGroup"},
				aAllowedParams),
			{$$updateGroupId : "myGroup"});
		assert.deepEqual(_ODataHelper.buildBindingParameters(
			{$$updateGroupId : "$direct", custom : "foo"}, aAllowedParams),
			{$$updateGroupId : "$direct"});

		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$unsupported : "foo"}, aAllowedParams);
		}, new Error("Unsupported binding parameter: $$unsupported"));

		assert.throws(function () {
			_ODataHelper.buildBindingParameters({$$updateGroupId : "~invalid"}, aAllowedParams);
		}, new Error("Unsupported value '~invalid' for binding parameter '$$updateGroupId'"));
	});

	//*********************************************************************************************
	QUnit.test("checkGroupId", function (assert) {
		// valid group IDs
		_ODataHelper.checkGroupId("myGroup");
		_ODataHelper.checkGroupId("$auto");
		_ODataHelper.checkGroupId("$direct");
		_ODataHelper.checkGroupId(undefined);
		_ODataHelper.checkGroupId("myGroup", true);

		// invalid group IDs
		["", "$invalid", 42].forEach(function (vGroupId) {
			assert.throws(function () {
				_ODataHelper.checkGroupId(vGroupId);
			}, new Error("Invalid group ID: " + vGroupId));
		});

		// invalid application group IDs
		["", "$invalid", 42, "$auto", "$direct", undefined].forEach(function (vGroupId) {
			assert.throws(function () {
				_ODataHelper.checkGroupId(vGroupId, true);
			}, new Error("Invalid group ID: " + vGroupId));
		});

		// invalid group with custom message
		assert.throws(function () {
			_ODataHelper.checkGroupId("$invalid", false, "Custom error message: ");
		}, new Error("Custom error message: $invalid"));
	});

	//*********************************************************************************************
	[
		["/canonical1", undefined], //set context
		[undefined, "foo eq 42"], //set filter
		["/canonical2", "foo eq 42"] //set context and filter
	].forEach(function (oFixture) {
		QUnit.test("createCache: proxy interface, " + oFixture[0] + ", " + oFixture[1],
			function (assert) {
				var oBinding = {},
					oFilterPromise = oFixture[1] && Promise.resolve(oFixture[1]),
					oPathPromise = oFixture[0] && Promise.resolve(oFixture[0]),
					oCache = {
						read : function () {}
					},
					oCacheProxy,
					oReadResult = {};

				function createCache(sPath, sFilter) {
					assert.strictEqual(sPath, oFixture[0]);
					assert.strictEqual(sFilter, oFixture[1]);
					return oCache;
				}

				this.mock(oCache).expects("read").withExactArgs("$auto", "foo")
					.returns(Promise.resolve(oReadResult));

				// code under test
				oCacheProxy = _ODataHelper.createCache(oBinding, createCache, oPathPromise,
					oFilterPromise);

				assert.strictEqual(oCacheProxy.hasPendingChanges(), false);
				assert.strictEqual(typeof oCacheProxy.resetChanges, "function");
				assert.strictEqual(typeof oCacheProxy.setActive, "function");
				assert.throws(function () {
					oCacheProxy.post();
				}, "POST request not allowed");
				assert.throws(function () {
					oCacheProxy.update();
				}, "PATCH request not allowed");

				return oCacheProxy.read("$auto", "foo").then(function (oResult) {
					assert.strictEqual(oBinding.oCache, oCache);
					assert.strictEqual(oCache.$canonicalPath, oFixture[0]);
					assert.strictEqual(oResult, oReadResult);
				});
			});
	});

	//*********************************************************************************************
	QUnit.test("createCache: deactivates previous cache", function (assert) {
		var oBinding = {};

		// code under test
		_ODataHelper.createCache(oBinding, function () {});

		oBinding.oCache = { setActive : function () {} };
		this.mock(oBinding.oCache).expects("setActive").withExactArgs(false);

		// code under test
		_ODataHelper.createCache(oBinding, function () {});
	});

	//*********************************************************************************************
	QUnit.test("createCache: use same cache for same path, async", function (assert) {
		var oBinding = {},
			oCache = {
				setActive : function () {},
				read : function () { return Promise.resolve({}); }
			},
			oCacheMock = this.mock(oCache),
			oPathPromise = Promise.resolve("p"),
			createCache = this.spy(function () { return oCache; });

		// code under test
		_ODataHelper.createCache(oBinding, createCache, oPathPromise);

		return oBinding.oCache.read().then(function () {
			assert.strictEqual(oBinding.oCache, oCache);

			oCacheMock.expects("setActive").withExactArgs(false);
			oCacheMock.expects("setActive").withExactArgs(true);
			// code under test
			_ODataHelper.createCache(oBinding, createCache, oPathPromise);

			return oBinding.oCache.read().then(function () {
				assert.strictEqual(oBinding.oCache, oCache);
				assert.strictEqual(createCache.callCount, 1);
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("createCache: use same cache for same path, sync", function (assert) {
		var oBinding = {},
			oCache = {setActive : function () {}},
			oCacheMock = this.mock(oCache),
			oPathPromise = _SyncPromise.resolve("p"),
			createCache = this.spy(function () { return oCache; });

		// code under test
		_ODataHelper.createCache(oBinding, createCache, oPathPromise);

		assert.strictEqual(oBinding.oCache, oCache);

		oCacheMock.expects("setActive").withExactArgs(false);
		oCacheMock.expects("setActive").withExactArgs(true);

		// code under test
		_ODataHelper.createCache(oBinding, createCache, oPathPromise);

		assert.strictEqual(oBinding.oCache, oCache);
		assert.strictEqual(createCache.callCount, 1);
	});

	//*********************************************************************************************
	QUnit.test("createCache: create new cache for empty canonical path", function (assert) {
		var oBinding = {},
			oCache = {setActive : function () {}},
			createCache = this.spy(function () { return oCache; });

		// code under test
		_ODataHelper.createCache(oBinding, createCache, undefined);

		// code under test
		_ODataHelper.createCache(oBinding, createCache, undefined);

		assert.strictEqual(createCache.callCount, 2);
	});

	//*********************************************************************************************
	QUnit.test("createCache: cache proxy !== binding's cache", function (assert) {
		var oBinding = {},
			oCache = {read : function () {}},
			oPromise,
			oReadResult = {};

		this.mock(oCache).expects("read").returns(Promise.resolve(oReadResult));

		// create a binding asynchronously and read from it
		_ODataHelper.createCache(oBinding, function () {
			return {/*cache*/};
		}, Promise.resolve("Employees('42')"));
		oPromise = oBinding.oCache.read();

		// create a binding synchronously afterwards (overtakes the first one, but must win)
		_ODataHelper.createCache(oBinding, function () {
			return oCache;
		});

		assert.strictEqual(oBinding.oCache, oCache);
		return oPromise.then(function (oResult) {
			assert.strictEqual(oBinding.oCache, oCache);
			assert.strictEqual(oResult, oReadResult);
		});
	});

	//*********************************************************************************************
	QUnit.test("createCache: fetchCanonicalPath fails", function (assert) {
		var oBinding = {
				oModel : {
					reportError : function () {}
				},
				toString : function () {return "MyBinding";}
			},
			oError = new Error("canonical path failure");

		function unexpected () {
			assert.ok(false, "unexpected call");
		}

		this.mock(oBinding.oModel).expects("reportError")
			.withExactArgs("Failed to create cache for binding MyBinding",
				"sap.ui.model.odata.v4._ODataHelper", sinon.match.same(oError));

		// code under test
		_ODataHelper.createCache(oBinding, unexpected, Promise.reject(oError));

		// code under test
		return oBinding.oCache.read("$auto", "foo").catch(function (oError0) {
			assert.strictEqual(oError0, oError);
		});
	});

	//*********************************************************************************************
	QUnit.test("createCache: fetchFilter fails", function (assert) {
		var oBinding = {
				oModel : {
					reportError : function () {}
				},
				toString : function () {return "MyBinding";}
			},
			oError = new Error("request filter failure");

		function unexpected () {
			assert.ok(false, "unexpected call");
		}

		this.mock(oBinding.oModel).expects("reportError")
			.withExactArgs("Failed to create cache for binding MyBinding",
				"sap.ui.model.odata.v4._ODataHelper", sinon.match.same(oError));

		// code under test
		_ODataHelper.createCache(oBinding, unexpected, undefined, Promise.reject(oError));

		// code under test
		return oBinding.oCache.read("$auto", "foo").catch(function (oError0) {
			assert.strictEqual(oError0, oError);
		});
	});

	//*********************************************************************************************
	QUnit.test("createContextCache: absolute", function (assert) {
		var oBinding = {
				oModel : {oRequestor : {}},
				sPath : "/SalesOrderList('1')/SO_2_BP",
				mQueryOptions : {}
			},
			oCache = {},
			oContext = {},
			mQueryOptions = {};

		this.mock(_ODataHelper).expects("getQueryOptions")
			.withExactArgs(sinon.match.same(oBinding), "", undefined)
			.returns(mQueryOptions);
		this.mock(_Helper).expects("buildPath").withExactArgs(undefined, oBinding.sPath)
			.returns(oBinding.sPath);
		this.mock(_Cache).expects("createSingle")
			.withExactArgs(sinon.match.same(oBinding.oModel.oRequestor), oBinding.sPath.slice(1),
				sinon.match.same(mQueryOptions))
			.returns(oCache);

		// code under test
		assert.strictEqual(_ODataHelper.createContextCache(oBinding, oContext),
			oBinding.oCache);

		assert.strictEqual(oBinding.oCache, oCache);
	});

	//*********************************************************************************************
	QUnit.test("createContextCache: relative, unresolved", function (assert) {
		var oBinding = {
				bRelative : true,
				sPath : "SO_2_BP"
			};

		this.mock(_ODataHelper).expects("getQueryOptions").never();
		this.mock(_Helper).expects("buildPath").never();
		this.mock(_Cache).expects("createSingle").never();

		// code under test
		assert.strictEqual(_ODataHelper.createContextCache(oBinding, undefined), undefined);

		assert.strictEqual(oBinding.oCache, undefined);
	});

	//*********************************************************************************************
	QUnit.test("createContextCache: relative, no query options", function (assert) {
		var oBinding = {
				bRelative : true,
				sPath : "SO_2_BP"
			},
			oContext = {
				fetchCanonicalPath : function () {}
			};

		this.mock(_ODataHelper).expects("getQueryOptions").never();
		this.mock(_Helper).expects("buildPath").never();
		this.mock(_Cache).expects("createSingle").never();

		// code under test
		assert.strictEqual(_ODataHelper.createContextCache(oBinding,oContext), undefined);

		assert.strictEqual(oBinding.oCache, undefined);
	});

	//*********************************************************************************************
	QUnit.test("createContextCache: relative, cache proxy", function (assert) {
		var oBinding = {
				bRelative : true,
				oModel : {oRequestor : {}},
				mQueryOptions : {},
				sPath : "SO_2_BP"
			},
			sCanonicalPath = "/SalesOrderList('1')",
			sCachePath = sCanonicalPath.slice(1) + "/SO_2_BP",
			oContext = {
				fetchCanonicalPath : function () {}
			},
			oCache = {read : function () { return Promise.resolve(); }},
			oPathPromise = Promise.resolve(sCanonicalPath),
			mQueryOptions = {};

		this.mock(oContext).expects("fetchCanonicalPath").withExactArgs().returns(oPathPromise);
		this.mock(_ODataHelper).expects("getQueryOptions")
			.withExactArgs(sinon.match.same(oBinding), "", sinon.match.same(oContext))
			.returns(mQueryOptions);
		this.mock(_Helper).expects("buildPath").withExactArgs(sCanonicalPath, oBinding.sPath)
			.returns("/" + sCachePath);
		this.mock(_Cache).expects("createSingle")
			.withExactArgs(sinon.match.same(oBinding.oModel.oRequestor), sCachePath,
				sinon.match.same(mQueryOptions))
			.returns(oCache);

		// code under test
		assert.strictEqual(_ODataHelper.createContextCache(oBinding, oContext),
			oBinding.oCache);

		return oBinding.oCache.read().then(function () {
			assert.strictEqual(oBinding.oCache, oCache);
		});
	});

	//*********************************************************************************************
	QUnit.test("createContextCache: base context", function (assert) {
		var oBinding = {
				bRelative : true,
				oModel : {oRequestor : {}},
				sPath : "SO_2_BP"
			},
			sCanonicalPath = "/SalesOrderList('1')",
			sCachePath = sCanonicalPath.slice(1) + "/SO_2_BP",
			oContext = {
				getPath : function () { return sCanonicalPath; }
			},
			oCache = {},
			mQueryOptions = {};

		this.mock(_ODataHelper).expects("getQueryOptions")
			.withExactArgs(sinon.match.same(oBinding), "", sinon.match.same(oContext))
			.returns(mQueryOptions);
		this.mock(_Helper).expects("buildPath").withExactArgs(sCanonicalPath, oBinding.sPath)
			.returns("/" + sCachePath);
		this.mock(_Cache).expects("createSingle")
			.withExactArgs(sinon.match.same(oBinding.oModel.oRequestor), sCachePath,
				sinon.match.same(mQueryOptions))
			.returns(oCache);

		// code under test
		assert.strictEqual(_ODataHelper.createContextCache(oBinding, oContext),
			oBinding.oCache);

		assert.strictEqual(oBinding.oCache, oCache);
	});

	//*********************************************************************************************
	[{
		bRelative : true,
		mQueryOptions : {$orderBy : "GrossAmount"}
	}, {
		bRelative : true,
		mQueryOptions : {$orderBy : "GrossAmount"},
		mInheritedQueryOptions : {$filter : "foo eq 'bar'", $orderBy : "GrossAmount"}
	}, {
		bRelative : true,
		mQueryOptions : {$filter : "foo eq 'bar'"},
		mInheritedQueryOptions : {$filter : "foo eq 'bar'", $orderBy : "GrossAmount"}
	}, {
		bRelative : true,
		aSorters : [{}]
	}, {
		bRelative : true,
		aApplicationFilters : [{}]
	}, {
		bRelative : true,
		aFilters : [{}]
	}, {
		bRelative : false,
		mQueryOptions : {$filter : "foo eq 'bar'"}
	}, {
		bRelative : false,
		aApplicationFilters : [{}]
	}, {
		bRelative : true,
		bBaseContext : true
	}].forEach(function (oFixture) {
		QUnit.test("createListCache:" + JSON.stringify(oFixture), function (assert) {
			var sCanonicalPath = "/SalesOrderList('1')",
				sCachePath = sCanonicalPath.slice(1) + "/SO_2_SOITEMS",
				oBinding = {
					aApplicationFilters : oFixture.aApplicationFilters || [],
					aFilters : oFixture.aFilters || [],
					oModel : {oRequestor : {}},
					sPath : oFixture.bRelative ? "SO_2_SOITEMS" : "/" + sCachePath,
					mQueryOptions : oFixture.mQueryOptions,
					bRelative : oFixture.bRelative,
					aSorters : oFixture.aSorters || []
				},
				oContext = oFixture.bBaseContext
					? { getPath : function () { return sCanonicalPath; } }
					: { fetchCanonicalPath : function () {} },
				oCache = {read : function () { return Promise.resolve(); }},
				bFilter = oFixture.aApplicationFilters || oFixture.aFilters,
				sFilter = bFilter ? "field eq 'value'" : undefined,
				oFilterPromise = bFilter ? Promise.resolve(sFilter) : undefined,
				mMergedQueryOptions = {},
				sOrderBy = "BuyerName,GrossAmount",
				mQueryOptions = oFixture.mInheritedQueryOptions || oFixture.mQueryOptions,
				oPathPromise = oFixture.bRelative ? Promise.resolve(sCanonicalPath) : undefined;

			if (!oFixture.bBaseContext) {
				this.mock(oContext).expects("fetchCanonicalPath")
					.exactly(oFixture.bRelative ? 1 : 0)
					.withExactArgs().returns(oPathPromise);
			}
			this.mock(_ODataHelper).expects("getQueryOptions")
				.withExactArgs(sinon.match.same(oBinding), "",
					sinon.match.same(oFixture.bRelative ? oContext : undefined))
				.returns(mQueryOptions);
			this.mock(_ODataHelper).expects("fetchFilter")
				.withExactArgs(sinon.match.same(oBinding),
					sinon.match.same(oFixture.bRelative ? oContext : undefined),
					sinon.match.same(oBinding.aApplicationFilters),
					sinon.match.same(oBinding.aFilters),
					mQueryOptions && mQueryOptions.$filter)
				.returns(oFilterPromise);
			this.mock(_ODataHelper).expects("buildOrderbyOption")
				.withExactArgs(sinon.match.same(oBinding.aSorters),
						mQueryOptions && mQueryOptions.$orderby)
				.returns(sOrderBy);
			this.mock(_ODataHelper).expects("mergeQueryOptions")
				.withExactArgs(sinon.match.same(mQueryOptions), sOrderBy, sFilter)
				.returns(mMergedQueryOptions);
			this.mock(_Helper).expects("buildPath")
				.withExactArgs(oFixture.bRelative ? sCanonicalPath : undefined, oBinding.sPath)
				.returns("/" + sCachePath);
			this.mock(_Cache).expects("create")
				.withExactArgs(sinon.match.same(oBinding.oModel.oRequestor), sCachePath,
					sinon.match.same(mMergedQueryOptions))
				.returns(oCache);

			// code under test
			assert.strictEqual(_ODataHelper.createListCache(oBinding, oContext),
				oBinding.oCache);

			if (oFixture.bBaseContext) {
				assert.strictEqual(oBinding.oCache, oCache);
				return undefined;
			}
			return oBinding.oCache.read().then(function () {
				assert.strictEqual(oBinding.oCache, oCache);
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("createListCache, nothing to do", function (assert) {
		var oBinding = {
				aApplicationFilters : [{}],
				aFilters : [{}],
				bRelative : true,
				aSorters : [{}]
			},
			oContext = {fetchCanonicalPath : function () {}};

		this.mock(_ODataHelper).expects("createCache").never();

		// code under test
		assert.strictEqual(_ODataHelper.createListCache(oBinding, undefined), undefined,
			"unresolved relative binding");

		oBinding.aSorters = [];
		oBinding.aApplicationFilters = [];
		oBinding.aFilters = [];

		// code under test
		assert.strictEqual(_ODataHelper.createListCache(oBinding, oContext), undefined,
			"resolved relative binding, but no sorter");
	});

	//*********************************************************************************************
	QUnit.test("buildOrderbyOption", function (assert) {
		var sOrderby = "bar desc";

		// empty sorters
		assert.strictEqual(_ODataHelper.buildOrderbyOption([]), "");
		// array of sorters
		assert.strictEqual(_ODataHelper.buildOrderbyOption([new Sorter("foo")]), "foo",
			"Sorter array, no query option");
		assert.strictEqual(_ODataHelper.buildOrderbyOption([new Sorter("foo"),
			new Sorter("bar", true)]), "foo,bar desc");

		// with system query option $orderby
		// empty sorters
		assert.strictEqual(_ODataHelper.buildOrderbyOption([], sOrderby), sOrderby);
		// array of sorters
		assert.strictEqual(_ODataHelper.buildOrderbyOption([new Sorter("foo")], sOrderby),
			"foo," + sOrderby, "Sorter array, with query option");
		assert.strictEqual(_ODataHelper.buildOrderbyOption([new Sorter("foo"),
			new Sorter("baz", true)], sOrderby), "foo,baz desc," + sOrderby);
	});

	//*********************************************************************************************
	QUnit.test("buildOrderbyOption - error", function (assert) {
		// non Sorter instances throw error
		assert.throws(function () {
			_ODataHelper.buildOrderbyOption(["foo"]);
		}, new Error("Unsupported sorter: 'foo' (string)"));
		assert.throws(function () {
			_ODataHelper.buildOrderbyOption([new Sorter("foo"), "", new Sorter("bar", true)]);
		}, new Error("Unsupported sorter: '' (string)"));
		assert.throws(function () {
			_ODataHelper.buildOrderbyOption([new Sorter("foo"), 42, new Sorter("bar", true)]);
		}, new Error("Unsupported sorter: '42' (number)"));
	});

	//*********************************************************************************************
	QUnit.test("toArray", function (assert) {
		var oSorter = new Sorter("foo", true),
			aSorters = [oSorter];

		assert.deepEqual(_ODataHelper.toArray(), []);
		assert.deepEqual(_ODataHelper.toArray(null), []);
		assert.deepEqual(_ODataHelper.toArray(""), [""]);
		assert.deepEqual(_ODataHelper.toArray("foo"), ["foo"]);
		assert.deepEqual(_ODataHelper.toArray(oSorter), aSorters);
		assert.strictEqual(_ODataHelper.toArray(aSorters), aSorters);
	});

	//*********************************************************************************************
	QUnit.test("mergeQueryOptions", function (assert) {
		[{
			mQueryOptions: undefined,
			sOrderBy : undefined,
			sFilter : undefined
		}, {
			mQueryOptions: {$orderby : "bar", $select : "Name"},
			sOrderBy : undefined,
			sFilter : undefined
		}, {
			mQueryOptions: undefined,
			sOrderBy : "foo",
			sFilter : undefined,
			oResult : {$orderby : "foo"}
		}, {
			mQueryOptions: {$orderby : "bar", $select : "Name"},
			sOrderBy : "foo,bar",
			sFilter : undefined,
			oResult : {$orderby : "foo,bar", $select : "Name"}
		}, {
			mQueryOptions: {$orderby : "bar", $select : "Name"},
			sOrderBy : "bar",
			sFilter : undefined
		}, {
			mQueryOptions: undefined,
			sOrderBy : undefined,
			sFilter : "foo",
			oResult : {$filter : "foo"}
		}, {
			mQueryOptions: {$filter : "bar", $select : "Name"},
			sOrderBy : undefined,
			sFilter : "foo,bar",
			oResult : {$filter : "foo,bar", $select : "Name"}
		}, {
			mQueryOptions: {$filter: "bar", $select : "Name"},
			sOrderBy : undefined,
			sFilter : "bar"
		}, {
			mQueryOptions: {$filter: "bar", $orderby : "foo", $select : "Name"},
			sOrderBy : "foo",
			sFilter : "bar"
		}, {
			mQueryOptions: {$filter: "foo", $orderby : "bar", $select : "Name"},
			sOrderBy : "foo,bar",
			sFilter : "bar,baz",
			oResult : {$filter : "bar,baz", $orderby : "foo,bar", $select : "Name"}
		}].forEach(function (oFixture, i) {
			var oResult = _ODataHelper.mergeQueryOptions(oFixture.mQueryOptions,
					oFixture.sOrderBy, oFixture.sFilter);
			if ("oResult" in oFixture) {
				assert.deepEqual(oResult, oFixture.oResult, i);
			} else {
				assert.strictEqual(oResult, oFixture.mQueryOptions, i);
			}
			if (oResult) {
				assert.ok(oResult.$orderby || !("$orderby" in oResult), i + ": $orderby");
				assert.ok(oResult.$filter || !("$filter" in oResult), i + ": $filter");
			}
		});
	});

	//*********************************************************************************************
	[
		{op : FilterOperator.BT, result : "SupplierName ge 'SAP' and SupplierName le 'XYZ'"},
		{op : FilterOperator.EQ, result : "SupplierName eq 'SAP'"},
		{op : FilterOperator.GE, result : "SupplierName ge 'SAP'"},
		{op : FilterOperator.GT, result : "SupplierName gt 'SAP'"},
		{op : FilterOperator.LE, result : "SupplierName le 'SAP'"},
		{op : FilterOperator.LT, result : "SupplierName lt 'SAP'"},
		{op : FilterOperator.NE, result : "SupplierName ne 'SAP'"},
		{op : FilterOperator.Contains, result : "contains(SupplierName,'SAP')"},
		{op : FilterOperator.EndsWith, result : "endswith(SupplierName,'SAP')"},
		{op : FilterOperator.StartsWith, result : "startswith(SupplierName,'SAP')"}
	].forEach(function (oFixture) {
		QUnit.test("fetchFilter: " + oFixture.op + " --> " + oFixture.result, function (assert) {
			var oBinding = {
					sPath : "/SalesOrderList('4711')/SO_2_ITEMS",
					oModel : {
						oMetaModel : {
							getMetaContext : function () {},
							fetchObject : function () {}
						},
						resolve : function () {}
					}
				},
				oFilter = new Filter("SupplierName", oFixture.op, "SAP", "XYZ"),
				oMetaContext = {},
				oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
				oHelperMock = this.mock(_Helper),
				oPropertyMetadata = {$Type : "Edm.String"};

			this.mock(oBinding.oModel).expects("resolve")
				.withExactArgs(oBinding.sPath, undefined).returns(oBinding.sPath);
			oMetaModelMock.expects("getMetaContext")
				.withExactArgs(oBinding.sPath).returns(oMetaContext);
			oMetaModelMock.expects("fetchObject")
				.withExactArgs("SupplierName", oMetaContext)
				.returns(_SyncPromise.resolve(oPropertyMetadata));
			oHelperMock.expects("formatLiteral").withExactArgs("SAP", "Edm.String")
				.returns("'SAP'");
			if (oFixture.op === FilterOperator.BT) {
				oHelperMock.expects("formatLiteral").withExactArgs("XYZ", "Edm.String")
					.returns("'XYZ'");
			}

			assert.strictEqual(
				_ODataHelper.fetchFilter(oBinding, undefined, [oFilter], [], undefined)
					.getResult(),
				oFixture.result);
		});
	});

	//*********************************************************************************************
	[false, true].forEach(function (bRelative) {
		QUnit.test("fetchFilter: dynamic and static filters, "
				+ (bRelative ? "relative" : "absolute") + " binding", function (assert) {
			var oBinding = {
					sPath : bRelative ? "BP_2_SO" : "/SalesOrderList",
					oModel : {
						oMetaModel : {
							getMetaContext : function (sPath) {
								return { path : sPath }; // path === metapath
							},
							fetchObject : function () {}
						},
						resolve : function () {}
					}
				},
				oContext = bRelative ? {} : undefined,
				oFilter0 = new Filter("BuyerName", FilterOperator.EQ, "SAP"),
				oFilter1 = new Filter("GrossAmount", FilterOperator.LE, 12345),
				oHelperMock = this.mock(_Helper),
				oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
				sResolvedPath =
					bRelative ? "/BusinessPartnerList('42')/BP_2_SO" : "/SalesOrderList";

			this.mock(oBinding.oModel).expects("resolve").twice()
				.withExactArgs(oBinding.sPath, sinon.match.same(oContext))
				.returns(sResolvedPath);
			oMetaModelMock.expects("fetchObject")
				.withExactArgs("BuyerName", {path : sResolvedPath})
				.returns(_SyncPromise.resolve({$Type : "Edm.String"}));
			oMetaModelMock.expects("fetchObject")
				.withExactArgs("GrossAmount", {path : sResolvedPath})
				.returns(_SyncPromise.resolve({$Type : "Edm.Decimal"}));
			oHelperMock.expects("formatLiteral").withExactArgs("SAP", "Edm.String")
				.returns("'SAP'");
			oHelperMock.expects("formatLiteral").withExactArgs(12345, "Edm.Decimal")
				.returns(12345);

			assert.strictEqual(
				_ODataHelper.fetchFilter(oBinding, oContext, [oFilter0, oFilter1], [],
					"GrossAmount ge 1000").getResult(),
				"(BuyerName eq 'SAP' and GrossAmount le 12345) and (GrossAmount ge 1000)");
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchFilter: static filter only", function (assert) {
		var oBinding = {
				sPath : "/SalesOrderList"
			};

		assert.strictEqual(
			_ODataHelper.fetchFilter(oBinding, undefined, [], [], "GrossAmount ge 1000")
				.getResult(),
			"GrossAmount ge 1000");
	});

	//*********************************************************************************************
	QUnit.test("fetchFilter: error invalid operator", function (assert) {
		var oBinding = {
				sPath : "/SalesOrderList",
				oModel : {
					oMetaModel : {
						getMetaContext : function (sPath) {
							return { path : sPath }; // path === metapath
						},
						fetchObject : function () {}
					},
					resolve : function () {}
				}
			},
			oFilter = new Filter("BuyerName", "invalid", "SAP"),
			oPropertyMetadata = {$Type : "Edm.String"};

		this.mock(oBinding.oModel).expects("resolve")
			.withExactArgs(oBinding.sPath, undefined).returns(oBinding.sPath);
		this.mock(oBinding.oModel.oMetaModel).expects("fetchObject")
			.withExactArgs("BuyerName", {path : oBinding.sPath})
			.returns(_SyncPromise.resolve(oPropertyMetadata));
		this.mock(_Helper).expects("formatLiteral").withExactArgs("SAP", "Edm.String")
			.returns("'SAP'");

		return _ODataHelper.fetchFilter(oBinding, undefined, [oFilter], [], undefined)
			.then(function () {
				assert.ok(false);
			}, function (oError) {
				assert.strictEqual(oError.message, "Unsupported operator: invalid");
			}
		);
	});

	//*********************************************************************************************
	QUnit.test("fetchFilter: error no metadata for filter path", function (assert) {
		var sPath = "/SalesOrderList/BuyerName",
			oMetaContext = {
				getPath : function () { return sPath; }
			},
			oBinding = {
				sPath : "/SalesOrderList",
				oModel : {
					oMetaModel : {
						getMetaContext : function () { return oMetaContext; },
						fetchObject : function () {}
					},
					resolve : function () {}
				}
			},
			oFilter = new Filter("BuyerName", FilterOperator.EQ, "SAP");

		this.mock(oBinding.oModel).expects("resolve")
			.withExactArgs(oBinding.sPath, undefined).returns(oBinding.sPath);
		this.mock(oBinding.oModel.oMetaModel).expects("fetchObject")
			.withExactArgs("BuyerName", oMetaContext)
			.returns(_SyncPromise.resolve(undefined));

		return _ODataHelper.fetchFilter(oBinding, undefined, [oFilter], [], undefined)
			.then(function () {
				assert.ok(false);
			}, function (oError) {
				assert.strictEqual(oError.message,
					"Type cannot be determined, no metadata for path: /SalesOrderList/BuyerName");
			}
		);
	});

	//*********************************************************************************************
	[
		{ filters : [], result : "" },
		{ filters : ["path0", "path1"], result : "path0 eq path0Value and path1 eq path1Value" },
		{ // "grouping": or conjunction for filters with same path
			filters : [{ p : "path0", v : "foo" }, "path1", { p : "path0", v : "bar" }],
			result : "(path0 eq foo or path0 eq bar) and path1 eq path1Value"
		}
	].forEach(function (oFixture) {
		QUnit.test("fetchFilter: flat filter '" + oFixture.result + "'", function (assert) {
			var oBinding = {
					sPath : "/SalesOrderList",
					oModel : {
						oMetaModel : {
							getMetaContext : function (sPath) {
								return { path : sPath }; // path === metapath
							},
							fetchObject : function () {}
						},
						resolve : function (sPath) {
							return sPath;
						}
					}
				},
				aFilters = [],
				oHelperMock = this.mock(_Helper),
				oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
				mRequestObjectByPath = {},
				oPropertyMetadata = {$Type : "Edm.Type"};

			oFixture.filters.forEach(function (vFilter) {
				var sPath,
					sValue;

				if (typeof vFilter === "string") { // single filter: path only
					sPath = vFilter; sValue = sPath + "Value";
				} else { // single filter: path and value
					sPath = vFilter.p; sValue = vFilter.v;
				}

				aFilters.push(new Filter(sPath, FilterOperator.EQ, sValue));
				if (!mRequestObjectByPath[sPath]) { // Edm type request happens only once per path
					mRequestObjectByPath[sPath] = true;
					oMetaModelMock.expects("fetchObject")
						.withExactArgs(sPath, {path : "/SalesOrderList"})
						.returns(Promise.resolve(oPropertyMetadata));
				}
				oHelperMock.expects("formatLiteral").withExactArgs(sValue, "Edm.Type")
					.returns(sValue);
			});

			return _ODataHelper.fetchFilter(oBinding, undefined, aFilters, [], undefined)
				.then(function (sFilterValue) {
					assert.strictEqual(sFilterValue, oFixture.result);
				});
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchFilter: hierarchical filter", function (assert) {
		var oBinding = {
				sPath : "/Set",
				oModel : {
					oMetaModel : {
						getMetaContext : function (sPath) {
							return { path : sPath }; // path === metapath
						},
						fetchObject : function () {}
					},
					resolve : function (sPath) {
						return sPath;
					}
				}
			},
			oFilterPromise,
			aFilters = [
				new Filter("p0.0", FilterOperator.EQ, "v0.0"),
				new Filter({
					filters : [
						new Filter("p1.0", FilterOperator.EQ, "v1.0"),
						new Filter("p1.1", FilterOperator.EQ, "v1.1")
					]
				}),
				new Filter({
					filters : [
						new Filter("p2.0", FilterOperator.EQ, "v2.0"),
						new Filter("p2.1", FilterOperator.EQ, "v2.1"),
						new Filter("p2.2", FilterOperator.EQ, "v2.2")
					],
					and : true
				}),
				new Filter("p3.0", FilterOperator.EQ, "v3.0")
			],
			oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
			oPropertyMetadata = {$Type : "Edm.String"},
			oPromise = Promise.resolve(oPropertyMetadata);

		oMetaModelMock.expects("fetchObject").withExactArgs("p0.0", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p1.0", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p1.1", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p2.0", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p2.1", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p2.2", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p3.0", {path : "/Set"})
			.returns(oPromise);

		oFilterPromise = _ODataHelper.fetchFilter(oBinding, undefined, aFilters, [], undefined);

		assert.strictEqual(oFilterPromise.isFulfilled(), false);
		return oFilterPromise.then(function (sFilterValue) {
			assert.strictEqual(sFilterValue,
				"p0.0 eq 'v0.0'"
				+ " and (p1.0 eq 'v1.0' or p1.1 eq 'v1.1')"
				+ " and (p2.0 eq 'v2.0' and p2.1 eq 'v2.1' and p2.2 eq 'v2.2')"
				+ " and p3.0 eq 'v3.0'"
			);
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchFilter: application and control filter", function (assert) {
		var aAppFilters = [new Filter("p0.0", FilterOperator.EQ, "v0.0")],
			oBinding = {
				sPath : "/Set",
				oModel : {
					oMetaModel : {
						getMetaContext : function (sPath) {
							return { path : sPath }; // path === metapath
						},
						fetchObject : function () {}
					},
					resolve : function (sPath) {
						return sPath;
					}
				}
			},
			aControlFilters = [new Filter("p1.0", FilterOperator.EQ, "v1.0")],
			oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
			oPropertyMetadata = {$Type : "Edm.String"},
			oPromise = Promise.resolve(oPropertyMetadata);

		oMetaModelMock.expects("fetchObject").withExactArgs("p0.0", {path : "/Set"})
			.returns(oPromise);
		oMetaModelMock.expects("fetchObject").withExactArgs("p1.0", {path : "/Set"})
			.returns(oPromise);

		return _ODataHelper.fetchFilter(oBinding, undefined, aAppFilters, aControlFilters,
				"p2.0 eq 'v2.0'")
			.then(function (sFilterValue) {
				assert.strictEqual(sFilterValue,
					"(p0.0 eq 'v0.0') and (p1.0 eq 'v1.0') and (p2.0 eq 'v2.0')");
			});
	});

	//*********************************************************************************************
	QUnit.skip("fetchFilter: filter with encoded path", function (assert) {
		// TODO encode in the filter or not?
		var aAppFilters = [new Filter("AmountIn%E2%82%AC", FilterOperator.GT, "10000")],
			oBinding = {
				sPath : "/Set",
				oModel : {
					oMetaModel : {
						getMetaContext : function (sPath) {
							// decoded path === metapath
							return { path : decodeURIComponent(sPath) };
						},
						fetchObject : function () {}
					},
					resolve : function (sPath) {
						return sPath;
					}
				}
			},
			oMetaModelMock = this.mock(oBinding.oModel.oMetaModel),
			oPropertyMetadata = {$Type : "Edm.Decimal"},
			oPromise = Promise.resolve(oPropertyMetadata);

		oMetaModelMock.expects("fetchObject").withExactArgs("AmountIn€", {path : "/Set"})
			.returns(oPromise);

		return _ODataHelper.fetchFilter(oBinding, undefined, aAppFilters, [], undefined)
			.then(function (sFilterValue) {
				assert.strictEqual(sFilterValue, "AmountIn€ gt 10000");
			});
	});

	//*********************************************************************************************
	[
		{mQueryOptions : undefined, sPath : "foo", sQueryPath : "delegate/to/context"},
		{mQueryOptions : undefined, sPath : "foo", sQueryPath : undefined}
	].forEach(function (oFixture, i) {
		QUnit.test("getQueryOptions - delegating - " + i, function (assert) {
			var oBinding = {
					mQueryOptions : oFixture.mQueryOptions,
					sPath : oFixture.sPath
				},
				oContext = {
					getQueryOptions : function () {}
				},
				mResultingQueryOptions = {},
				sResultPath = "any/path";

			this.mock(_Helper).expects("buildPath")
				.withExactArgs(oBinding.sPath, oFixture.sQueryPath).returns(sResultPath);
			this.mock(oContext).expects("getQueryOptions")
				.withExactArgs(sResultPath)
				.returns(mResultingQueryOptions);

			// code under test
			assert.strictEqual(
				_ODataHelper.getQueryOptions(oBinding, oFixture.sQueryPath, oContext),
				mResultingQueryOptions, "sQueryPath:" + oFixture.sQueryPath);

			// code under test
			assert.strictEqual(
				_ODataHelper.getQueryOptions(oBinding, oFixture.sQueryPath, undefined),
				undefined, "no query options and no context");
		});
	});

	//*********************************************************************************************
	QUnit.test("getQueryOptions ignores base context", function (assert) {
		var oBaseContext = {},
			oBinding = {
				mQueryOptions : undefined,
				sPath : "foo"
			};


		// code under test
		assert.strictEqual(_ODataHelper.getQueryOptions(oBinding, "", oBaseContext), undefined,
			"no query options and base context ignored");
	});

	//*********************************************************************************************
	QUnit.test("getQueryOptions - query options and no path", function (assert) {
		var oBinding = {
				mQueryOptions : {}
			},
			oContext = {
				getQueryOptions : function () {}
			};

		this.mock(_Helper).expects("buildPath").never();
		this.mock(oContext).expects("getQueryOptions").never();

		// code under test
		assert.strictEqual(_ODataHelper.getQueryOptions(oBinding), oBinding.mQueryOptions,
			oContext);
		assert.strictEqual(_ODataHelper.getQueryOptions(oBinding, ""), oBinding.mQueryOptions,
			oContext);
	});

	//*********************************************************************************************
	QUnit.test("getQueryOptions - find in query options", function (assert) {
		var mEmployee2EquipmentOptions = {
				$orderby : "EquipmentId"
			},
			mTeam2EmployeeOptions = {
				"$expand" : {
					"Employee_2_Equipment" : mEmployee2EquipmentOptions
				},
				$orderby : "EmployeeId"
			},
			mParameters = {
				"$expand" : {
					"Team_2_Employees" : mTeam2EmployeeOptions,
					"Team_2_Manager" : null,
					"Team_2_Equipments" : true
				},
				"$orderby" : "TeamId",
				"sap-client" : "111"
			},
			oBinding = {
				oModel : {
					mUriParameters : {"sap-client" : "111"}
				},
				mQueryOptions : mParameters,
				sPath : "any/path"
			},
			oContext = {
				getQueryOptions : function () {}
			},
			oODataHelperMock = this.mock(_ODataHelper),
			mResultingQueryOptions = {}; // content not relevant

		this.mock(_Helper).expects("buildPath").never();
		this.mock(oContext).expects("getQueryOptions").never();

		[
			{sQueryPath : "foo", mResult : undefined},
			{sQueryPath : "Team_2_Employees", mResult : mTeam2EmployeeOptions},
			{
				sQueryPath : "Team_2_Employees/Employee_2_Equipment",
				mResult : mEmployee2EquipmentOptions
			},
			{sQueryPath : "Team_2_Employees/Employee_2_Equipment/foo", mResult : undefined},
			{sQueryPath : "Team_2_Employees/foo/Employee_2_Equipment", mResult : undefined},
			{sQueryPath : "Team_2_Manager", mResult : undefined},
			{sQueryPath : "Team_2_Equipments", mResult : undefined},
			{
				sQueryPath : "Team_2_Employees(2)/Employee_2_Equipment('42')",
				mResult : mEmployee2EquipmentOptions
			},
			{
				sQueryPath : "15/Team_2_Employees/2/Employee_2_Equipment/42",
				mResult : mEmployee2EquipmentOptions
			}
		].forEach(function (oFixture, i) {
			oODataHelperMock.expects("buildQueryOptions")
				.withExactArgs(sinon.match.same(oBinding.oModel.mUriParameters),
					oFixture.mResult ? sinon.match.same(oFixture.mResult) : undefined, true)
				.returns(mResultingQueryOptions);
			// code under test
			assert.strictEqual(_ODataHelper.getQueryOptions(oBinding, oFixture.sQueryPath),
				mResultingQueryOptions, "sQueryPath:" + oFixture.sQueryPath);
		});
	});
	//TODO handle encoding in getQueryOptions

	//*********************************************************************************************
	[{ // no threshold
		range : [0, 10, 0],
		expected : {start : 0, length : 10}
	}, {
		range : [40, 10, 0],
		expected : {start : 40, length : 10}
	}, {
		current : [[40, 50]],
		range : [40, 10, 0],
		expected : {start : 40, length : 10}
	}, {
		current : [[50, 110]],
		range : [100, 20, 0],
		expected : {start : 100, length : 20}
	}, { // initial read with threshold
		range : [0, 10, 100],
		expected : {start : 0, length : 110}
	}, { // iPrefetchSize / 2 available on both sides
		current : [[0, 110]],
		range : [50, 10, 100],
		expected : {start : 50, length : 10}
	}, { // missing a row at the end
		current : [[0, 110]],
		range : [51, 10, 100],
		expected : {start : 51, length : 110}
	}, { // missing a row before the start
		current : [[100, 260]],
		range : [149, 10, 100],
		expected : {start : 49, length : 110}
	}, { // missing a row before the start, do not read beyond 0
		current : [[40, 200]],
		range : [89, 10, 100],
		expected : {start : 0, length : 99}
	}, { // missing data on both sides, do not read beyond 0
		range : [430, 10, 100],
		expected : {start : 330, length : 210}
	}, { // missing data on both sides, do not read beyond 0
		current : [[40, 100]],
		range : [89, 10, 100],
		expected : {start : 0, length : 199}
	}, { // transient context
		range : [-1, 10, 1],
		bTransient : true,
		expected : {start : -1, length : 11}
	}].forEach(function (oFixture) {
		QUnit.test("getReadRange: " + oFixture.range, function (assert) {
			var aContexts = [],
				oResult;

			// prepare contexts array
			if (oFixture.current) {
				oFixture.current.forEach(function (aRange) {
					var i, n;

					for (i = aRange[0], n = aRange[1]; i < n; i++) {
						aContexts[i] = i;
					}
				});
			}
			if (oFixture.bTransient) {
				aContexts[-1] = -1;
			}

			oResult = _ODataHelper.getReadRange(aContexts, oFixture.range[0], oFixture.range[1],
				oFixture.range[2]);

			assert.deepEqual(oResult, oFixture.expected);
		});
	});

	//*********************************************************************************************
	QUnit.test("hasPendingChanges(sPath): with cache", function (assert) {
		var oBinding = {
				oCache : {
					hasPendingChanges : function () {}
				}
			},
			oCacheMock = this.mock(oBinding.oCache),
			oResult = {};

		["foo", ""].forEach(function (sPath) {
			oCacheMock.expects("hasPendingChanges").withExactArgs(sPath).returns(oResult);

			assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, undefined, sPath), oResult,
				"path=" + sPath);
		});
	});

	//*********************************************************************************************
	QUnit.test("hasPendingChanges(sPath): without cache", function (assert) {
		var oBinding = {
				sPath : "relative"
			},
			sBuildPath = "~/foo",
			oContext = {
				hasPendingChanges : function () {}
			},
			oContextMock = this.mock(oContext),
			oHelperMock = this.mock(_Helper),
			oResult = {};

		//code under test
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, undefined, "foo"), false);
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, undefined, ""), false);

		oBinding.oContext = oContext;
		["foo", ""].forEach(function (sPath) {
			oHelperMock.expects("buildPath").withExactArgs(oBinding.sPath, sPath)
				.returns(sBuildPath);
			oContextMock.expects("hasPendingChanges").withExactArgs(sBuildPath).returns(oResult);

			//code under test
			assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, undefined, sPath), oResult);
		});
	});

	//*********************************************************************************************
	QUnit.test("hasPendingChanges(sPath): without cache, base context", function (assert) {
		assert.strictEqual(
			_ODataHelper.hasPendingChanges({oContext : {}}, undefined, "foo"),
			false);
	});

	//*********************************************************************************************
	QUnit.test("hasPendingChanges(bAskParent): with cache", function (assert) {
		var oChild1 = {},
			oChild2 = {},
			oBinding = {
				oCache : {
					hasPendingChanges : function () {}
				},
				oModel : {
					getDependentBindings : function () {}
				}
			},
			oCacheMock = this.mock(oBinding.oCache),
			oHelperMock = this.mock(_ODataHelper),
			// remember the function, so that we can call it and nevertheless mock it to place
			// assertions on recursive calls
			fnHasPendingChanges = _ODataHelper.hasPendingChanges;

		this.mock(oBinding.oModel).expects("getDependentBindings").atLeast(1)
			.withExactArgs(sinon.match.same(oBinding)).returns([oChild1, oChild2]);
		[false, true].forEach(function (bAskParent) {
			oCacheMock.expects("hasPendingChanges").withExactArgs("").returns(true);
			oHelperMock.expects("hasPendingChanges").never();

			// code under test
			assert.strictEqual(fnHasPendingChanges(oBinding, bAskParent), true,
				"cache returns true, bAskParent=" + bAskParent);

			oCacheMock.expects("hasPendingChanges").withExactArgs("").returns(false);
			oHelperMock.expects("hasPendingChanges").withExactArgs(sinon.match.same(oChild1), false)
				.returns(true);

			// code under test
			assert.strictEqual(fnHasPendingChanges(oBinding, bAskParent), true,
				"child1 returns true, bAskParent=" + bAskParent);

			oCacheMock.expects("hasPendingChanges").withExactArgs("").returns(false);
			oHelperMock.expects("hasPendingChanges").withExactArgs(sinon.match.same(oChild1), false)
				.returns(false);
			oHelperMock.expects("hasPendingChanges").withExactArgs(sinon.match.same(oChild2), false)
				.returns(false);

			// code under test
			assert.strictEqual(fnHasPendingChanges(oBinding, bAskParent), false,
					"all return false, bAskParent=" + bAskParent);
		});
	});

	//*********************************************************************************************
	QUnit.test("hasPendingChanges(bAskParent): without cache", function (assert) {
		var oBinding = {
				sPath : "relative",
				oModel : {
					getDependentBindings : function () {}
				}
			},
			oContext = {
				hasPendingChanges : function () {}
			},
			oContextMock = this.mock(oContext),
			oResult = {};

		this.mock(oBinding.oModel).expects("getDependentBindings").atLeast(1)
			.withExactArgs(sinon.match.same(oBinding)).returns([]);

		//code under test
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, false), false);
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, true), false);

		oBinding.oContext = oContext;
		oContextMock.expects("hasPendingChanges").never();

		//code under test
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, false), false);

		oContextMock.expects("hasPendingChanges").withExactArgs(oBinding.sPath).returns(oResult);

		//code under test
		assert.strictEqual(_ODataHelper.hasPendingChanges(oBinding, true), oResult);
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(sPath): with cache", function (assert) {
		var oBinding = {
				oCache : {
					resetChanges : function () {}
				}
			},
			oCacheMock = this.mock(oBinding.oCache);

		["foo", ""].forEach(function (sPath) {
			oCacheMock.expects("resetChanges").withExactArgs(sPath);

			_ODataHelper.resetChanges(oBinding, undefined, sPath);
		});
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(sPath): without cache", function (assert) {
		var oBinding = {
				sPath : "relative"
			},
			sBuildPath = "~/foo",
			oContext = {
				resetChanges : function () {}
			},
			oContextMock = this.mock(oContext),
			oHelperMock = this.mock(_Helper);

		//code under test
		_ODataHelper.resetChanges(oBinding, undefined, "foo");
		_ODataHelper.resetChanges(oBinding, undefined, "");

		oBinding.oContext = oContext;
		["foo", ""].forEach(function (sPath) {
			oHelperMock.expects("buildPath").withExactArgs(oBinding.sPath, sPath)
				.returns(sBuildPath);
			oContextMock.expects("resetChanges").withExactArgs(sBuildPath);

			//code under test
			_ODataHelper.resetChanges(oBinding, undefined, sPath);
		});
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(sPath): without cache, base context", function (assert) {
		_ODataHelper.resetChanges({oContext : {}}, undefined, "foo");
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(bAskParent): with cache", function (assert) {
		var oChild1 = {},
			oChild2 = {},
			oBinding = {
				oCache : {
					resetChanges : function () {}
				},
				oModel : {
					getDependentBindings : function () {}
				}
			},
			oCacheMock = this.mock(oBinding.oCache),
			oHelperMock = this.mock(_ODataHelper),
			// remember the function, so that we can call it and nevertheless mock it to place
			// assertions on recursive calls
			fnResetChanges = _ODataHelper.resetChanges;

		this.mock(oBinding.oModel).expects("getDependentBindings").atLeast(1)
			.withExactArgs(sinon.match.same(oBinding)).returns([oChild1, oChild2]);
		[false, true].forEach(function (bAskParent) {
			oCacheMock.expects("resetChanges").withExactArgs("");
			oHelperMock.expects("resetChanges").withExactArgs(sinon.match.same(oChild1), false);
			oHelperMock.expects("resetChanges").withExactArgs(sinon.match.same(oChild2), false);

			// code under test
			fnResetChanges(oBinding, bAskParent);
		});
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(bAskParent): without cache", function (assert) {
		var oBinding = {
				sPath : "relative",
				oModel : {
					getDependentBindings : function () {}
				}
			},
			oContext = {
				resetChanges : function () {}
			},
			oContextMock = this.mock(oContext);

		this.mock(oBinding.oModel).expects("getDependentBindings").atLeast(1)
			.withExactArgs(sinon.match.same(oBinding)).returns([]);

		//code under test
		_ODataHelper.resetChanges(oBinding, false);
		_ODataHelper.resetChanges(oBinding, true);

		oBinding.oContext = oContext;
		oContextMock.expects("resetChanges").never();

		//code under test
		_ODataHelper.resetChanges(oBinding, false);

		oContextMock.expects("resetChanges").withExactArgs(oBinding.sPath);

		//code under test
		_ODataHelper.resetChanges(oBinding, true);
	});

	//*********************************************************************************************
	QUnit.test("resetChanges(bAskParent): without cache, base context", function (assert) {
		var oBinding = {
				oContext : {},
				oModel : {
					getDependentBindings : function () {
						return [];
					}
				}
			};

		//code under test
		_ODataHelper.resetChanges(oBinding, true);
	});

	//*********************************************************************************************
	[false, true].forEach(function (bAsync) {
		QUnit.test("fetchDiff, " + (bAsync ? "a" : "") + "synchronous", function (assert) {
			var oBinding = {
					oContext : {},
					oModel : {
						getMetaModel : function () {},
						resolve : function () {}
					},
					sPath : "EMPLOYEE_2_EQUIPMENTS",
					aPreviousData : [{"Category" : "C0", "ID" : "ID0"},
						{"Category" : "C1", "ID" : "ID1"}],
					bUseExtendedChangeDetection : true
				},
				aDiff = [/*some diff*/],
				oDiffPromise,
				aKeys = ["Category", "ID"],
				oKeyPromise = _SyncPromise.resolve(bAsync ? Promise.resolve(aKeys) : aKeys),
				oMetaContext = {},
				oMetaModel = {
					fetchObject : function () {},
					getMetaContext : function () {}
				},
				oMetaModelMock = this.mock(oMetaModel),
				aNewData = [{"Category" : "C0", "ID" : "ID0"}, {"Category" : "C2", "ID" : "ID2"}],
				aResult = [{"Category" : "C0", "ID" : "ID0", "Name" : "Name0"},
					{"Category" : "C2", "ID" : "ID2", "Name" : "Name2"}];

			this.mock(oBinding.oModel).expects("getMetaModel").withExactArgs().returns(oMetaModel);
			this.mock(oBinding.oModel).expects("resolve")
				.withExactArgs(oBinding.sPath, sinon.match.same(oBinding.oContext))
				.returns("~");
			oMetaModelMock.expects("getMetaContext").withExactArgs("~")
				.returns(oMetaContext);
			oMetaModelMock.expects("fetchObject").withExactArgs("$Type/$Key", oMetaContext)
				.returns(oKeyPromise);
			this.mock(jQuery.sap).expects("arraySymbolDiff")
				.withExactArgs(sinon.match.same(oBinding.aPreviousData), aNewData)
				.returns(aDiff);

			// code under test
			oDiffPromise = _ODataHelper.fetchDiff(oBinding, aResult, 0, 2);

			assert.strictEqual(oDiffPromise.isFulfilled(), !bAsync);
			return oDiffPromise.then(function (oResult) {
				assert.deepEqual(oBinding.aPreviousData, aNewData);
				assert.deepEqual(oResult, {aDiff : aDiff, iLength : 2});
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchDiff, no data available", function (assert) {
		var aPreviousData = [],
			oBinding = {
				aPreviousData : aPreviousData,
				bUseExtendedChangeDetection : true
			},
			oDiffPromise;

		// code under test
		oDiffPromise = _ODataHelper.fetchDiff(oBinding, undefined, 0, 100);

		assert.strictEqual(oBinding.aPreviousData, aPreviousData);
		assert.deepEqual(oDiffPromise.getResult(), {iLength : 100, aDiff : []});
	});

	//*********************************************************************************************
	QUnit.test("fetchDiff, no extended change detection", function (assert) {
		var oBinding = {
				bUseExtendedChangeDetection : false
			},
			oDiffPromise;

		// code under test
		oDiffPromise = _ODataHelper.fetchDiff(oBinding, [], 23, 42);

		assert.deepEqual(oDiffPromise.getResult(), undefined);
	});

	//*********************************************************************************************
	QUnit.test("fetchDiff, result is shorter", function (assert) {
		var aPreviousData = [{"ID" : "ID0a"}, {"ID" : "ID1a"}],
			oBinding = {
				oContext : {},
				oModel : {
					getMetaModel : function () {},
					resolve : function () {}
				},
				sPath : "EMPLOYEE_2_EQUIPMENTS",
				aPreviousData : aPreviousData.slice(),
				bUseExtendedChangeDetection : true
			},
			aDiff = [/*some diff*/],
			oKeyPromise = _SyncPromise.resolve(["ID"]),
			oMetaContext = {},
			oMetaModel = {
				fetchObject : function () {},
				getMetaContext : function () {}
			},
			oMetaModelMock = this.mock(oMetaModel),
			aNewData = [{"ID" : "ID0"}],
			aResult = [{"ID" : "ID0", "Name" : "N0"}];

		this.mock(oBinding.oModel).expects("getMetaModel").withExactArgs().returns(oMetaModel);
		this.mock(oBinding.oModel).expects("resolve")
			.withExactArgs(oBinding.sPath, sinon.match.same(oBinding.oContext))
			.returns("~");
		oMetaModelMock.expects("getMetaContext").withExactArgs("~")
			.returns(oMetaContext);
		oMetaModelMock.expects("fetchObject").withExactArgs("$Type/$Key", oMetaContext)
			.returns(oKeyPromise);
		this.mock(jQuery.sap).expects("arraySymbolDiff")
			.withExactArgs(aPreviousData, aNewData)
			.returns(aDiff);

		// code under test
		return _ODataHelper.fetchDiff(oBinding, aResult, 0, 2).then(function (oResult) {
			assert.deepEqual(oBinding.aPreviousData, [{"ID" : "ID0"}]);
			assert.deepEqual(oResult, {aDiff : aDiff, iLength : 2});
		});
	});

	//*********************************************************************************************
	[
		{keys : ["Category", "ID", "OtherID"], logDetails : "Missing key(s): ID,OtherID"},
		{keys : undefined, logDetails : "Type for path ~ has no keys"}
	].forEach(function (oFixture) {
		QUnit.test("fetchDiff, error: keys missing", function (assert) {
			var oBinding = {
					oContext : {},
					oModel : {
						getMetaModel : function () {},
						resolve : function () {}
					},
					sPath : "EMPLOYEE_2_EQUIPMENTS",
					aPreviousData : [{"Category" : "C0", "ID" : "ID0"},
						{"Category" : "C1a", "ID" : "ID1a"}],
					toString : function () { return "~B~"; },
					bUseExtendedChangeDetection : true
				},
				oKeyPromise = Promise.resolve(oFixture.keys),
				oMetaContext = {},
				oMetaModel = {
					fetchObject : function () {},
					getMetaContext : function () {}
				},
				oMetaModelMock = this.mock(oMetaModel),
				aResult = [{"Category" : "C1", /*"ID" : "ID1",*/"Name" : "N1"},
					{"Category" : "C2", /*"ID" : "ID2",*/"Name" : "N2"}];

			this.mock(oBinding.oModel).expects("getMetaModel").withExactArgs().returns(oMetaModel);
			this.mock(oBinding.oModel).expects("resolve")
				.withExactArgs(oBinding.sPath, sinon.match.same(oBinding.oContext))
				.returns("~");
			oMetaModelMock.expects("getMetaContext").withExactArgs("~")
				.returns(oMetaContext);
			oMetaModelMock.expects("fetchObject").withExactArgs("$Type/$Key", oMetaContext)
				.returns(oKeyPromise);
			this.oLogMock.expects("warning").withExactArgs(
					"Disable extended change detection as diff computation failed: ~B~",
					oFixture.logDetails, "sap.ui.model.odata.v4.ODataListBinding");

			// code under test
			return _ODataHelper.fetchDiff(oBinding, aResult, 0, 2).then(function (oResult) {
				assert.deepEqual(oBinding.aPreviousData, []);
				assert.strictEqual(oResult, undefined);
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("fetchDiff, bDetectUpdates=true", function (assert) {
		var oBinding = {
				bDetectUpdates : true,
				aPreviousData : ["s0 previous", "s1 previous"],
				bUseExtendedChangeDetection : true
			},
			aDiff = [/*some diff*/],
			oDiffPromise,
			oJSONMock = this.mock(JSON),
			aResult = [{}, {}];

		oJSONMock.expects("stringify").withExactArgs(aResult[0]).returns("s0 new");
		oJSONMock.expects("stringify").withExactArgs(aResult[1]).returns("s1 new");
		this.mock(jQuery.sap).expects("arraySymbolDiff")
			.withExactArgs(sinon.match.same(oBinding.aPreviousData), ["s0 new", "s1 new"])
			.returns(aDiff);

		// code under test
		oDiffPromise = _ODataHelper.fetchDiff(oBinding, aResult, 0, 2);

		assert.deepEqual(oBinding.aPreviousData, ["s0 new", "s1 new"]);
		assert.deepEqual(oDiffPromise.getResult(), {aDiff : aDiff, iLength : 2});
	});

	//*********************************************************************************************
	QUnit.test("isRefreshable", function (assert) {
		assert.strictEqual(_ODataHelper.isRefreshable({bRelative : false}), true, "absolute");
		assert.strictEqual(_ODataHelper.isRefreshable({bRelative : true}), undefined,
			"relative - no context");
		assert.strictEqual(_ODataHelper.isRefreshable(
			{bRelative : true, oContext : {getBinding : function () {}}}), false,
			"relative - V4 context");
		assert.strictEqual(_ODataHelper.isRefreshable({bRelative : true, oContext : {}}), true,
			"relative - base context");
	});
});
