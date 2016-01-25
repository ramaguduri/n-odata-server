/// <reference path="../../../typescript/declarations/node.d.ts" />
/// <reference path="../../../typescript/declarations/es6-promise.d.ts" />
import commons = require('../../common/odata_common');
import constants = require('../../constants/odata_constants');
import {MetaAssociation} from "./metaAssociation";

var builder = require('xmlbuilder');


/**
 * This class handles the meatdata of the OData service
 */
export class Metadata {
	private _associations:Array<MetaAssociation>;
	private _app:any;

	constructor(app) {
		this._app = app;
		this._associations = [];
	};

	/**
	 * This function builds the metadata output for the current application
	 * @param models
	 * @returns {any}
	 */
	public buildMetadata():Promise<any> {
		var EntityType = [];
		var EntitySet = [];
		var appModels = this._app.models();  // have to do this because models will not be known in forEach

		this._app.models().forEach((function (model) {

				var entityTypeObj:any = {
					"@Name": model.definition.name
				};

				// Properties of EntityType
				var arrProps:Array<Object> = [];
				model.definition.columnNames().forEach((function (propName) {
					var property:any = model.definition.properties[propName];

					// exclude deprecated properties
					if (property.deprecated !== true) {
						var edmType:String = this._convertType(property);
						edmType = edmType || property.type.name;
						arrProps.push({"@Name": propName, "@Type": edmType});
					}

					if (property.id) {
						entityTypeObj.Key = {
							PropertyRef: {
								"@Name": propName
							}
						}
					}
				}).bind(this));
				entityTypeObj.Property = arrProps;


				// NavigationProperties of EntityType
				var arrNavProps:Array<Object> = [];
				for (var relation in model.definition.settings.relations) {
					var currentAssoc:MetaAssociation = MetaAssociation.findOrCreateAssociationForModelRelation(model.definition, model.definition.settings.relations[relation], relation, appModels, this._associations);
					var navProperty = {
						"@Name": relation,
						"@Relationship": constants.ODATA_NAMESPACE + "." + currentAssoc.getName()
				};
					navProperty["@FromRole"] = (currentAssoc ? currentAssoc.getRolename1() : "N.A.");
					navProperty["@ToRole"] = (currentAssoc ? currentAssoc.getRolename2() : "N.A.");
					arrNavProps.push(navProperty);
				}
				entityTypeObj.NavigationProperty = arrNavProps;

				EntityType.push(entityTypeObj);


				// Create EntitySet for EntityType
				var entitySetObj:any = {
					"@Name": commons.getPluralForModel(model),
					"@EntityType": constants.ODATA_NAMESPACE + '.' + model.definition.name
				};
				EntitySet.push(entitySetObj);
			}).bind(this)
		);

		//TODO: create metadata for complexTypes
		//for (var typeKey in model.complexTypes) {
		//	var complexType = {
		//		"ComplexType": {
		//			"@Name": typeKey,
		//			"#list": []
		//		}
		//	};
		//
		//	for (var propKey in model.complexTypes[typeKey]) {
		//		var property = model.complexTypes[typeKey][propKey];
		//
		//		complexType.ComplexType["#list"].push({
		//			"Property": {"@Name": propKey, "@Type": property.type}
		//		});
		//	}
		//
		//	schemas.push(complexType);
		//}

		var associationPromises:Array<any> = MetaAssociation.getAssociationsForXML(this._associations);
		var associationSetPromises:Array<any> = MetaAssociation.getAssociationSetsForXML(this._associations, this._app.models);

		return new Promise((resolve, reject) => {
			Promise.all(associationPromises)
				.then(function (associationPromises) {
					var Association:Array<any> = [];
					for (var i = 0; i < associationPromises.length; i++) {
						Association.push(associationPromises[i]);
					}
					return Association;
				}).then(function (Associations:Array<any>) {
					Promise.all(associationSetPromises).then(function (associationSetPromises) {
							var AssociationSet:Array<any> = [];
							for (var i = 0; i < associationSetPromises.length; i++) {
								AssociationSet.push(associationSetPromises[i]);
							}
							return {Assoc: Associations, AssocSet: AssociationSet};
					}
				).then((obj:any) => {
					var Association = obj.Assoc;
					var AssociationSet = obj.AssocSet;
					var xmlBuilder = builder.create(
						{
							"edmx:Edmx": {
								"@xmlns:edmx": "http://schemas.microsoft.com/ado/2007/06/edmx",
								"@xmlns:m": "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata",
								"@Version": "1.0",
								"edmx:DataServices": {
									"@m.DataServiceVersion": "2.0",
									"Schema": {
										"@xmlns": "http://schemas.microsoft.com/ado/2008/09/edm",
										"@Namespace": constants.ODATA_NAMESPACE,
										EntityType,
										Association,
										"EntityContainer": {
											"@Name": constants.ODATA_NAMESPACE,
											"@m:IsDefaultEntityContainer": "true",
											EntitySet,
											AssociationSet
										}
									}
								}
							}
						}, {version: '1.0', encoding: 'UTF-8'}
					).end({pretty: true});
					resolve(xmlBuilder);
				});
				})
		})

	};

	/**
	 * converts a loopback datatype into a OData datatype
	 * @param property, loopback property
	 * @private
	 */
	private _convertType(property:any):String {
		var retValue:String;
		var dbType = property.type.name;
		switch (dbType) {
			case "String":
				retValue = "Edm.String";
				break;

			case "Date":
				retValue = "Edm.DateTime"
				break;

			case "Number":
				if (property.id) {
					retValue = "Edm.Int32"
				} else {
					retValue = "Edm.Decimal"
				}
				break;

			case "Boolean":
				retValue = "Edm.Boolean"
				break;

			default:
				break;
		}
		return retValue;
	}

}

