var version = sap.ui.version.split('.');
if (parseInt(version[0]) <= 1 && parseInt(version[1]) < 78) {
    sap.ui.getCore().loadLibraries(['sap/ui/fl']);
    sap.ui.require(['sap/ui/fl/FakeLrepConnector'], function(FakeLrepConnector) {
        jQuery.extend(FakeLrepConnector.prototype, {
            create: function(oChange) {
                return Promise.resolve();
            },
            stringToAscii: function(sCodeAsString) {
                if (!sCodeAsString || sCodeAsString.length === 0) {
                    return '';
                }
                var sAsciiString = '';
                for (var i = 0; i < sCodeAsString.length; i++) {
                    sAsciiString += sCodeAsString.charCodeAt(i) + ',';
                }
                if (
                    sAsciiString !== null &&
                    sAsciiString.length > 0 &&
                    sAsciiString.charAt(sAsciiString.length - 1) === ','
                ) {
                    sAsciiString = sAsciiString.substring(0, sAsciiString.length - 1);
                }
                return sAsciiString;
            },
            loadChanges: function() {
                var oResult = {
                    changes: [],
                    settings: {
                        isKeyUser: true,
                        isAtoAvailable: false,
                        isProductiveSystem: false
                    }
                };
                var aPromises = [];
                var sCacheBusterFilePath = '/sap-ui-cachebuster-info.json';
                var trustedHosts = [/^localhost$/, /^.*.applicationstudio.cloud.sap$/];
                var url = new URL(window.location.toString());
                var isValidHost = trustedHosts.some((host) => {
                    return host.test(url.hostname);
                });
                return new Promise(function(resolve, reject) {
                    if (!isValidHost) reject(console.log('cannot load flex changes: invalid host'));
                    $.ajax({
                        url: url.origin + sCacheBusterFilePath,
                        type: 'GET',
                        cache: false
                    })
                        .then(function(oCachebusterContent) {
                            //we are looking for only change files
                            var aChangeFilesPaths = Object.keys(oCachebusterContent).filter(function(sPath) {
                                return sPath.endsWith('.change');
                            });
                            $.each(aChangeFilesPaths, function(index, sFilePath) {
                                if (sFilePath.indexOf('changes') === 0) {
                                    /*eslint-disable no-param-reassign*/
                                    if (!isValidHost) reject(console.log('cannot load flex changes: invalid host'));
                                    aPromises.push(
                                        $.ajax({
                                            url: url.origin + '/' + sFilePath,
                                            type: 'GET',
                                            cache: false
                                        }).then(function(sChangeContent) {
                                            return JSON.parse(sChangeContent);
                                        })
                                    );
                                }
                            });
                        })
                        .always(function() {
                            return Promise.all(aPromises).then(function(aChanges) {
                                return new Promise(function(resolve, reject) {
                                    if (aChanges.length === 0) {
                                        if (!isValidHost) reject(console.log('cannot load flex changes: invalid host'));
                                        $.ajax({
                                            url: url.origin + '/changes/',
                                            type: 'GET',
                                            cache: false
                                        })
                                            .then(function(sChangesFolderContent) {
                                                var regex = /(\/changes\/[^"]*\.change)/g;
                                                var result = regex.exec(sChangesFolderContent);

                                                while (result !== null) {
                                                    if (!isValidHost)
                                                        reject(console.log('cannot load flex changes: invalid host'));
                                                    aPromises.push(
                                                        $.ajax({
                                                            url: url.origin + result[1],
                                                            type: 'GET',
                                                            cache: false
                                                        }).then(function(sChangeContent) {
                                                            return JSON.parse(sChangeContent);
                                                        })
                                                    );
                                                    result = regex.exec(sChangesFolderContent);
                                                }
                                                resolve(Promise.all(aPromises));
                                            })
                                            .fail(function(obj) {
                                                // No changes folder, then just resolve
                                                resolve(aChanges);
                                            });
                                    } else {
                                        resolve(aChanges);
                                    }
                                }).then(function(aChanges) {
                                    var aChangePromises = [],
                                        aProcessedChanges = [];
                                    aChanges.forEach(function(oChange) {
                                        var sChangeType = oChange.changeType;
                                        if (sChangeType === 'addXML' || sChangeType === 'codeExt') {
                                            /*eslint-disable no-nested-ternary*/
                                            var sPath =
                                                sChangeType === 'addXML'
                                                    ? oChange.content.fragmentPath
                                                    : sChangeType === 'codeExt'
                                                    ? oChange.content.codeRef
                                                    : '';
                                            var sWebappPath = sPath.match(/webapp(.*)/);
                                            var sUrl = '/' + sWebappPath[0];
                                            aChangePromises.push(
                                                $.ajax({
                                                    url: sUrl,
                                                    type: 'GET',
                                                    cache: false
                                                }).then(function(oFileDocument) {
                                                    if (sChangeType === 'addXML') {
                                                        oChange.content.fragment = FakeLrepConnector.prototype.stringToAscii(
                                                            oFileDocument.documentElement.outerHTML
                                                        );
                                                        oChange.content.selectedFragmentContent =
                                                            oFileDocument.documentElement.outerHTML;
                                                    } else if (sChangeType === 'codeExt') {
                                                        oChange.content.code = FakeLrepConnector.prototype.stringToAscii(
                                                            oFileDocument
                                                        );
                                                        oChange.content.extensionControllerContent = oFileDocument;
                                                    }
                                                    return oChange;
                                                })
                                            );
                                        } else {
                                            aProcessedChanges.push(oChange);
                                        }
                                    });
                                    if (aChangePromises.length > 0) {
                                        return Promise.all(aChangePromises).then(function(aUpdatedChanges) {
                                            aUpdatedChanges.forEach(function(oChange) {
                                                aProcessedChanges.push(oChange);
                                            });
                                            aProcessedChanges.sort(function(change1, change2) {
                                                return new Date(change1.creation) - new Date(change2.creation);
                                            });
                                            oResult.changes = aProcessedChanges;
                                            var oLrepChange = {
                                                changes: oResult,
                                                componentClassName: 'productsmanager'
                                            };
                                            resolve(oLrepChange);
                                        });
                                    } else {
                                        aProcessedChanges.sort(function(change1, change2) {
                                            return new Date(change1.creation) - new Date(change2.creation);
                                        });
                                        oResult.changes = aProcessedChanges;
                                        var oLrepChange = {
                                            changes: oResult,
                                            componentClassName: 'productsmanager'
                                        };
                                        resolve(oLrepChange);
                                    }
                                });
                            });
                        });
                });
            }
        });
        FakeLrepConnector.enableFakeConnector();
    });
}
