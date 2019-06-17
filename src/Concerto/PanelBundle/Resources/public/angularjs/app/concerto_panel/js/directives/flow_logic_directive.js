'use strict';
angular.module('concertoPanel').directive('flowLogic', ['$http', '$compile', '$timeout', '$uibModal', '$filter', 'TestCollectionService', 'DialogsService', function ($http, $compile, $timeout, $uibModal, $filter, TestCollectionService, DialogsService) {
  return {
    restrict: 'A',
    link: function (scope, element, attrs, controllers) {
      scope.initialized = false;
      scope.refreshing = false;
      scope.flowScale = 1;
      scope.nodeContext = null;
      scope.currentMouseEvent = null;
      scope.selectedNodeIds = [];
      scope.rectangleContainedNodeIds = [];
      scope.disableContextMenu = false;
      scope.mouseDown = false;
      scope.mouseButtonDown = 0;
      scope.rightClickEvent = null;
      scope.selectionRectangle = $("#selection-rectangle");
      scope.rectangleSelectionActive = false;
      scope.movingActive = false;
      scope.selectionRectanglePoints = {x1: 0, y1: 0, x2: 0, y2: 0, sx: 0, sy: 0, ex: 0, ey: 0};
      scope.selectionDisabled = false;
      scope.maximized = false;
      scope.lastActiveNodeId = null;
      scope.jsPlumbEventsEnabled = true;
      scope.dialogsService = DialogsService;

      scope.updateSelectionRectangle = function () {
        scope.selectionRectanglePoints.sx = Math.min(scope.selectionRectanglePoints.x1, scope.selectionRectanglePoints.x2);
        scope.selectionRectanglePoints.ex = Math.max(scope.selectionRectanglePoints.x1, scope.selectionRectanglePoints.x2);
        scope.selectionRectanglePoints.sy = Math.min(scope.selectionRectanglePoints.y1, scope.selectionRectanglePoints.y2);
        scope.selectionRectanglePoints.ey = Math.max(scope.selectionRectanglePoints.y1, scope.selectionRectanglePoints.y2);
        scope.selectionRectangle.css("left", scope.selectionRectanglePoints.sx + 'px');
        scope.selectionRectangle.css("top", scope.selectionRectanglePoints.sy + 'px');
        scope.selectionRectangle.css("width", scope.selectionRectanglePoints.ex - scope.selectionRectanglePoints.sx + 'px');
        scope.selectionRectangle.css("height", scope.selectionRectanglePoints.ey - scope.selectionRectanglePoints.sy + 'px');
      };

      $.fn.flow = function () {
        var lastPosition = null;
        var position = null;

        $(this).on("mousedown mouseup mousemove", function (e) {
          if (e.button === 2)
            scope.rightClickEvent = e;

          if (e.type == "mousedown") {
            scope.mouseButtonDown = e.button;
            scope.mouseDown = true;
            lastPosition = [e.clientX, e.clientY];
            scope.disableContextMenu = false;

            if (e.button === 2) {
              scope.selectionRectanglePoints.x1 = (e.pageX - $("#flowContainer").offset().left) / scope.flowScale;
              scope.selectionRectanglePoints.y1 = (e.pageY - $("#flowContainer").offset().top) / scope.flowScale;
              scope.selectionRectanglePoints.x2 = scope.selectionRectanglePoints.x1;
              scope.selectionRectanglePoints.y2 = scope.selectionRectanglePoints.y1;
              scope.updateSelectionRectangle();
            }
          }
          if (e.type == "mouseup") {
            scope.movingActive = false;
            if (scope.selectionDisabled) {
              scope.selectionDisabled = false;
              return;
            }
            scope.mouseDown = false;
            if (e.button === 2) {
              scope.rectangleContainedNodeIds = [];
              scope.selectionRectangle.hide();
              scope.rectangleSelectionActive = false;

              var containedNodes = scope.getRectangleContainedNodeIds();
              if (containedNodes.length > 0)
                scope.clearNodeSelection();
              for (var i = 0; i < containedNodes.length; i++) {
                scope.addNodeToSelection(containedNodes[i]);
              }
            }
            scope.$apply();
          }

          if (e.type == "mousemove" && scope.mouseDown == true && scope.mouseButtonDown === 2) {
            scope.selectionRectanglePoints.x2 = (e.pageX - $("#flowContainer").offset().left) / scope.flowScale;
            scope.selectionRectanglePoints.y2 = (e.pageY - $("#flowContainer").offset().top) / scope.flowScale;
            scope.updateSelectionRectangle();
            var difference = [scope.selectionRectanglePoints.x2 - scope.selectionRectanglePoints.x1, scope.selectionRectanglePoints.y2 - scope.selectionRectanglePoints.y1];
            var dist = Math.sqrt(difference[0] * difference[0] + difference[1] * difference[1]);
            if (dist > 2) {
              scope.disableContextMenu = true;
              scope.selectionRectangle.show();
              scope.rectangleSelectionActive = true;
              scope.rectangleContainedNodeIds = scope.getRectangleContainedNodeIds();
            }
          }

          if (e.type == "mousemove" && scope.mouseDown == true && scope.mouseButtonDown === 0) {
            scope.movingActive = true;
            position = [e.clientX, e.clientY];
            var difference = [(position[0] - lastPosition[0]), (position[1] - lastPosition[1])];
            $(this).scrollLeft($(this).scrollLeft() - difference[0]);
            $(this).scrollTop($(this).scrollTop() - difference[1]);
            lastPosition = [e.clientX, e.clientY];
          }
        });
      };

      scope.toggleMaximize = function () {
        scope.maximized = !scope.maximized;
        if (scope.maximized) {
          $("body").addClass("modal-open");
        } else {
          $("body").removeClass("modal-open");
        }
      };

      scope.getRectangleContainedNodeIds = function () {
        var result = [];
        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          var sx = scope.selectionRectanglePoints.sx;
          var ex = scope.selectionRectanglePoints.ex;
          var sy = scope.selectionRectanglePoints.sy;
          var ey = scope.selectionRectanglePoints.ey;
          if (node.posX >= sx && node.posX <= ex && node.posY >= sy && node.posY <= ey && node.type == 0)
            result.push(node.id);
        }
        return result;
      };

      scope.resetView = function () {
        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          $("#flowContainerScroll").scrollLeft(node.posX * scope.flowScale);
          $("#flowContainerScroll").scrollTop(node.posY * scope.flowScale);
          break;
        }
      };

      scope.setZoom = function (value, instance, el) {
        if (scope.refreshing)
          return;
        var maxZoom = 1;
        var minZoom = 0.25;
        var zoomSteps = 25;
        var zoom = value > 0 ? scope.flowScale + (maxZoom - minZoom) / zoomSteps : scope.flowScale - (maxZoom - minZoom) / zoomSteps;
        zoom = Math.max(minZoom, zoom);
        zoom = Math.min(maxZoom, zoom);

        var transformOrigin = [0, 0];
        instance = instance || jsPlumb;
        el = el || instance.getContainer();
        var p = ["webkit", "moz", "ms", "o"],
            s = "scale(" + zoom + ", " + zoom + ")",
            oString = (transformOrigin[0] * 100) + "% " + (transformOrigin[1] * 100) + "%";
        for (var i = 0; i < p.length; i++) {
          el.style[p[i] + "Transform"] = s;
          el.style[p[i] + "TransformOrigin"] = oString;
        }

        el.style["transform"] = s;
        el.style["transformOrigin"] = oString;

        var cw = $("#flowContainerWrapper");
        cw.css("width", (zoom * 30000) + "px");
        cw.css("height", (zoom * 30000) + "px");

        instance.setZoom(zoom);

        $("#flowContainerScroll").scrollLeft($("#flowContainerScroll")[0].scrollLeft * (zoom / scope.flowScale));
        $("#flowContainerScroll").scrollTop($("#flowContainerScroll")[0].scrollTop * (zoom / scope.flowScale));

        scope.flowScale = zoom;
      };

      scope.onFlowCtxOpened = function () {
        scope.clearNodeSelection();
      };

      scope.onNodeCtxOpened = function ($event, nodeId) {
        if (scope.selectedNodeIds.indexOf(nodeId) === -1) {
          scope.clearNodeSelection();
        }

        scope.setLastActiveNodeId(nodeId);
        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          if (nodeId === node.id)
            scope.nodeContext = node;
        }
      };

      scope.truncateNodeTitle = function (title) {
        return title;
      };

      scope.clearNodeSelection = function () {
        scope.selectedNodeIds = [];
        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          node.selected = false;
        }
      };

      scope.toggleNodeSelection = function (id) {
        var index = scope.selectedNodeIds.indexOf(id);
        if (index === -1) {
          scope.selectedNodeIds.push(id);
          scope.collectionService.getNode(id).selected = true;
        } else {
          scope.selectedNodeIds.splice(index, 1);
          scope.collectionService.getNode(id).selected = false;
        }
      };

      scope.addNodeToSelection = function (id) {
        var index = scope.selectedNodeIds.indexOf(id);
        if (index === -1) {
          scope.selectedNodeIds.push(id);
          scope.collectionService.getNode(id).selected = true;
        }
      };

      scope.isGetterNode = function (node) {
        if (node.type != 0)
          return false;
        for (var i = 0; i < node.ports.length; i++) {
          var port = node.ports[i];
          if (port.type == 2)
            return false;
        }
        return true;
      };

      scope.refreshNode = function (node) {
        scope.jsPlumbEventsEnabled = false;
        jsPlumb.setSuspendDrawing(true);
        jsPlumb.remove("node" + node.id);
        scope.drawNode(node);
        scope.jsPlumbEventsEnabled = true;
        for (var i = 0; i < scope.object.nodesConnections.length; i++) {
          var connection = scope.object.nodesConnections[i];
          if (connection.sourceNode == node.id || connection.destinationNode == node.id) {
            scope.connect(connection);
          }
        }
        jsPlumb.setSuspendDrawing(false, true);
      };

      scope.refreshConnections = function (nodesIds, manualDrawingResume) {
        scope.jsPlumbEventsEnabled = false;
        jsPlumb.setSuspendDrawing(true);
        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          if (nodesIds.indexOf(node.id) !== -1) {
            jsPlumb.remove("node" + node.id);
            scope.drawNode(node);
          }
        }
        scope.jsPlumbEventsEnabled = true;
        for (var i = 0; i < scope.object.nodesConnections.length; i++) {
          var connection = scope.object.nodesConnections[i];
          if (nodesIds.indexOf(connection.sourceNode) !== -1 || nodesIds.indexOf(connection.destinationNode) !== -1) {
            scope.connect(connection);
          }
        }
        if (!manualDrawingResume)
          jsPlumb.setSuspendDrawing(false, true);
      };

      scope.hidePort = function (portId) {
        var port = scope.collectionService.getPort(portId);
        var title = null;
        var message = null;
        switch (port.type) {
          case 0: {
            title = Trans.TEST_FLOW_PORT_DIALOG_TITLE_REMOVE_INPUT;
            message = Trans.TEST_FLOW_PORT_DIALOG_CONTENT_REMOVE_INPUT.pf(port.name);
            break;
          }
          case 1: {
            title = Trans.TEST_FLOW_PORT_DIALOG_TITLE_REMOVE_RETURN;
            message = Trans.TEST_FLOW_PORT_DIALOG_CONTENT_REMOVE_RETURN.pf(port.name);
            break;
          }
          case 2: {
            title = Trans.TEST_FLOW_PORT_DIALOG_TITLE_REMOVE_BRANCH;
            message = Trans.TEST_FLOW_PORT_DIALOG_CONTENT_REMOVE_BRANCH.pf(port.name);
            break;
          }
        }

        DialogsService.confirmDialog(
            title,
            message,
            function (data) {
              $http.post(Paths.TEST_FLOW_PORT_HIDE.pf(port.id)).success(
                  function () {
                    if (port.dynamic == 1) {
                      scope.collectionService.removePort(portId);
                    } else {
                      port.exposed = 0;
                    }
                    var node = scope.collectionService.getNode(port.node);
                    scope.refreshNode(node);
                  }
              );
            }
        );
      };

      scope.addPort = function (nodeId, type) {
        var node = scope.collectionService.getNode(nodeId);
        var template = null;
        switch (type) {
          case 0:
            template = "port_input_add_dialog.html";
            break;
          case 1:
            template = "port_return_add_dialog.html";
            break;
          case 2:
            template = "port_branch_add_dialog.html";
            break;
        }

        var modalInstance = $uibModal.open({
          templateUrl: Paths.DIALOG_TEMPLATE_ROOT + template,
          controller: PortAddController,
          scope: scope,
          resolve: {
            node: function () {
              return node;
            },
            connections: function () {
              return scope.object.nodesConnections;
            },
            editable: function () {
              return !scope.object.starterContent || scope.administrationSettingsService.starterContentEditable;
            }
          },
          size: "lg"
        });

        modalInstance.result.then(function (response) {
          if (response.action == 0) {
            //exposing nodes
            scope.refreshNode(node);
            $http.post(Paths.TEST_FLOW_PORT_EXPOSE, {
              "exposedPorts": JSON.stringify(response.exposedPorts)
            });
          }
          else {
            //adding dynamic input node
            $http.post(Paths.TEST_FLOW_PORT_ADD_DYNAMIC.pf(nodeId, type), {
              "name": response.name
            }).success(function (data) {
              switch (data.result) {
                case 0:
                  node.ports.push(JSON.parse(data.object));
                  scope.refreshNode(node);
                  break;
                case 1:
                  DialogsService.alertDialog(
                      Trans.TEST_FLOW_DIALOG_NODE_INPUT_ADD_TITLE,
                      data.errors[0],
                      "danger",
                      "sm"
                  );
                  break;
              }
            });
          }
        }, function () {
        });
      };

      scope.drawNode = function (node) {

        /* SETTINGS START */
        var portTopMargin = 20;
        var portElemMargin = 30;
        var portBottomMargin = -10;
        var flowEndpoint = ["Rectangle", {width: 25, height: 25}];
        var varEndpoint = ["Dot", {radius: 12.5}];
        /* SETTINGS END */

        node.ports = $filter('orderBy')(node.ports, ["-dynamic", "name"]);
        var fullName = "";
        var title = "";
        var nodeClass = "";
        var description = scope.collectionService.getNode(node.id).sourceTestDescription;
        if (node.type == 1) {
          fullName = Trans.TEST_FLOW_NODE_NAME_START;
          if (node.title != "")
            title = scope.truncateNodeTitle(node.title);
          else
            title = scope.truncateNodeTitle(fullName);
          description = Trans.TEST_FLOW_NODE_DESCRIPTION_START;
          nodeClass = "nodeStart";
        } else if (node.type == 2) {
          fullName = Trans.TEST_FLOW_NODE_NAME_END;
          if (node.title != "")
            title = scope.truncateNodeTitle(node.title);
          else
            title = scope.truncateNodeTitle(fullName);
          description = Trans.TEST_FLOW_NODE_DESCRIPTION_END;
          nodeClass = "nodeEnd";
        } else if (node.type == 0) {
          fullName = node.sourceTestName;
          if (node.title != "")
            title = scope.truncateNodeTitle(node.title);
          else
            title = scope.truncateNodeTitle(fullName);
          var test = scope.collectionService.get(node.sourceTest);
          if (test.sourceWizard) {
            title = "<a ng-click='editNodeWizard(collectionService.getNode(" + node.id + "), collectionService.get(" + node.sourceTest + "))'>" + title + "</a>";
          }
        }

        var elemHtml = "<div context-menu='onNodeCtxOpened($event, " + node.id + ")' data-target='menu-node' id='node" + node.id + "' class='node " + nodeClass + "' ng-class='{\"node-selected\": selectedNodeIds.indexOf(" + node.id + ")!==-1, \"node-selected-candidate\": rectangleContainedNodeIds.indexOf(" + node.id + ")!==-1, \"node-active\": " + node.id + "===lastActiveNodeId}' style='top:" + node.posY + "px; left:" + node.posX + "px;' ng-click='setLastActiveNodeId(" + node.id + ");' context-menu-disabled='object.starterContent && !administrationSettingsService.starterContentEditable'>";
        var headerIcons = "";
        if (node.type == 1 || node.type == 2) {
          elemHtml = "<div id='node" + node.id + "' class='node " + nodeClass + "' style='top:" + node.posY + "px; left:" + node.posX + "px;' ng-class='{\"node-active\": " + node.id + "===lastActiveNodeId }' ng-click='setLastActiveNodeId(" + node.id + ")'>";
        } else {
          headerIcons = "<div class='node-header-icons'>" +
              "<i class='clickable glyphicon glyphicon-menu-hamburger' tooltip-append-to-body='true' uib-tooltip-html='\"" + Trans.TEST_FLOW_BUTTONS_NODE_MENU + "\"' ng-click='openNodeContextMenu($event, " + node.id + ")'></i>" +
              "<input type='checkbox' ng-model='collectionService.getNode(" + node.id + ").selected' ng-change='toggleNodeSelection(" + node.id + ")' />" +
              "</div>";
        }
        elemHtml += "<div class='node-header' tooltip-append-to-body='true' uib-tooltip-html='\"" + description + "\"'>" + headerIcons + title + "</div>" +
            "<div class='node-content'><div class='node-content-left'></div><div class='node-content-right'></div></div>";
        var elem = $(elemHtml).appendTo("#flowContainer");
        var elemContent = elem.find(".node-content");
        var elemContentLeft = elemContent.find(".node-content-left");
        var elemContentRight = elemContent.find(".node-content-right");
        var leftCount = 0;
        var rightCount = 0;

        //in port
        if (node.type != 1 && !scope.isGetterNode(node)) {
          var tooltip = Trans.TEST_FLOW_PORT_DESCRIPTION_IN;
          var overlayElem = $("<div class='portLabel portLabelIn' uib-tooltip-html='\"" + tooltip + "\"' tooltip-append-to-body='true'>" + Trans.TEST_FLOW_PORT_NAME_IN + "</div>");
          $compile(overlayElem)(scope);
          overlayElem.appendTo(elemContentLeft);

          jsPlumb.addEndpoint(elemContent, {
            uuid: "node" + node.id + "-ep_entry",
            isTarget: true,
            maxConnections: -1,
            endpoint: flowEndpoint,
            anchor: [-0.042, 0, -1, 0, 0, portTopMargin + leftCount * portElemMargin],
            paintStyle: {fillStyle: "white", strokeStyle: "grey"},
            parameters: {
              targetNode: node,
              targetPort: null
            }
          }).setEnabled(!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable);
          leftCount++;
        }

        //add branch
        if (node.type == 0) {
          var overlayElem = $(
              "<div class='portLabel portLabelBranch' uib-tooltip-html='\"" + Trans.TEST_FLOW_PORT_ADD_BRANCH + "\"' tooltip-append-to-body='true'  ng-click='addPort(" + node.id + ", 2)'>" +
              "<i class='clickable glyphicon glyphicon-plus portBranchIcon'></i>" +
              "</div>"
          );
          overlayElem.appendTo(elemContentRight);

          rightCount++;
        }

        if (node.type != 2) {
          for (var i = 0; i < node.ports.length; i++) {
            var port = node.ports[i];

            //branches
            if (scope.isPortVisible(node, port) && port.type === 2) {

              var overlayElem = $(
                  "<div class='portLabel portLabelBranch'>" +
                  "<span uib-tooltip-html='getPortTooltip(" + port.id + ")' tooltip-append-to-body='true' ng-click='editPortCode(collectionService.getPort(" + port.id + "))'>" + port.name + "</span>" +
                  "</div>"
              );
              overlayElem.appendTo(elemContentRight);

              jsPlumb.addEndpoint(elemContent, {
                uuid: "node" + node.id + "-ep" + port.id,
                isSource: true,
                maxConnections: 1,
                endpoint: flowEndpoint,
                anchor: [1.053, 0, 1, 0, 0, portTopMargin + rightCount * portElemMargin],
                paintStyle: {fillStyle: port.dynamic == 1 ? "#ffdd84" : "#cca335", strokeStyle: "grey"},
                parameters: {
                  sourceNode: node,
                  sourcePort: port
                }
              }).setEnabled(!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable);
              rightCount++;
            }
          }
        }

        //add return
        if (node.type == 0) {
          var overlayElem = $(
              "<div class='portLabel portLabelReturn' uib-tooltip-html='\"" + Trans.TEST_FLOW_PORT_ADD_RETURN + "\"' tooltip-append-to-body='true'  ng-click='addPort(" + node.id + ", 1)'>" +
              "<i class='clickable glyphicon glyphicon-plus portReturnIcon'></i>" +
              "</div>"
          );
          overlayElem.appendTo(elemContentRight);

          rightCount++;
        }

        //out for start node
        if (node.type == 1) {
          var overlayElem = $("<div class='portLabel portLabelBranch' uib-tooltip-html='\"" + Trans.TEST_FLOW_PORT_DESCRIPTION_OUT + "\"' tooltip-append-to-body='true'>" + Trans.TEST_FLOW_PORT_NAME_OUT + "</div>");
          $compile(overlayElem)(scope);
          overlayElem.appendTo(elemContentRight);

          jsPlumb.addEndpoint(elemContent, {
            uuid: "node" + node.id + "-ep_out",
            isSource: true,
            maxConnections: 1,
            endpoint: flowEndpoint,
            anchor: [1.053, 0, 1, 0, 0, portTopMargin + rightCount * portElemMargin],
            paintStyle: {fillStyle: "#cca335", strokeStyle: "grey"},
            parameters: {
              sourceNode: node,
              sourcePort: null
            }
          }).setEnabled(!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable);
          rightCount++;
        }

        //add input
        if (node.type == 0) {
          var overlayElem = $(
              "<div class='portLabel' uib-tooltip-html='\"" + Trans.TEST_FLOW_PORT_ADD_INPUT + "\"' tooltip-append-to-body='true'  ng-click='addPort(" + node.id + ", 0)'>" +
              "<i class='clickable glyphicon glyphicon-plus portInputIcon'></i>" +
              "</div>"
          );
          overlayElem.appendTo(elemContentLeft);

          leftCount++;
        }

        //input param
        for (var i = 0; i < node.ports.length; i++) {
          var port = node.ports[i];

          if (scope.isPortVisible(node, port) && port.type === 0) {
            var overlayElem = $("<div class='portLabel portLabelInput' " +
                "ng-class='{\"port-non-default-value\": !usesDefaultValue(collectionService.getPort(" + port.id + "))}'>" +
                "<span uib-tooltip-html='getPortTooltip(" + port.id + ")' tooltip-append-to-body='true' ng-click='editPortCode(collectionService.getPort(" + port.id + "))'>" + port.name + "</span>" +
                "</div>");
            overlayElem.appendTo(elemContentLeft);

            jsPlumb.addEndpoint(elemContent, {
              uuid: "node" + node.id + "-ep" + port.id,
              maxConnections: -1,
              isTarget: true,
              endpoint: varEndpoint,
              anchor: [-0.042, 0, -1, 0, 0, portTopMargin + leftCount * portElemMargin],
              paintStyle: {fillStyle: port.dynamic == "1" ? "#a8c6e0" : "#337ab7", strokeStyle: "grey"},
              overlays: [[
                "Custom", {
                  create: function (component) {
                    var portId = component._jsPlumb.parameters.targetPort.id;

                    var overlayElem = $("<span><i class='glyphicon glyphicon-arrow-down pointer-icon' ng-class='{\"hidden\": collectionService.getPort(" + portId + ").pointer === \"0\"}'></i></span>");
                    $compile(overlayElem)(scope);
                    return overlayElem;
                  },
                  cssClass: "port-overlay",
                  location: [0.5, 0.6],
                  id: "overlayCode" + port.id
                }
              ]],
              parameters: {
                targetNode: node,
                targetPort: port
              }
            }).setEnabled(!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable);
            leftCount++;
          } else if (scope.isPortVisible(node, port) && port.type === 1) { //return vars

            var overlayElem = $(
                "<div class='portLabel portLabelReturn'>" +
                "<span uib-tooltip-html='getPortTooltip(" + port.id + ")' tooltip-append-to-body='true' ng-click='editPortCode(collectionService.getPort(" + port.id + "))'>" + port.name + "</span>" +
                "</div>"
            );
            overlayElem.appendTo(elemContentRight);

            jsPlumb.addEndpoint(elemContent, {
              uuid: "node" + node.id + "-ep" + port.id,
              isSource: true,
              maxConnections: -1,
              endpoint: varEndpoint,
              anchor: [1.053, 0, 1, 0, 0, portTopMargin + rightCount * portElemMargin],
              paintStyle: {fillStyle: port.dynamic == "1" ? "#ef7785" : "#a52937", strokeStyle: "grey"},
              overlays: [[
                "Custom", {
                  create: function (component) {
                    var portId = component._jsPlumb.parameters.sourcePort.id;

                    var overlayElem = $("<span><i class='glyphicon glyphicon-arrow-up pointer-icon' ng-class='{\"hidden\": collectionService.getPort(" + portId + ").pointer === \"0\"}'></i></span>");
                    $compile(overlayElem)(scope);
                    return overlayElem;
                  },
                  cssClass: "port-overlay",
                  location: [0.5, 0.6],
                  id: "overlayCode" + port.id
                }
              ]],
              parameters: {
                sourceNode: node,
                sourcePort: port
              }
            }).setEnabled(!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable);
            rightCount++;
          }
        }

        elemContent.css("height", (portTopMargin + Math.max(leftCount, rightCount) * portElemMargin + portBottomMargin) + "px");
        if (!scope.object.starterContent || scope.administrationSettingsService.starterContentEditable) {
          jsPlumb.draggable(elem, {
            containment: true,
            drag: function (event, ui) {
              if (scope.selectedNodeIds.indexOf(node.id) === -1)
                return;
              var offset = {
                x: elem.position().left / scope.flowScale - node.posX,
                y: elem.position().top / scope.flowScale - node.posY
              };

              node.posX = elem.position().left / scope.flowScale;
              node.posY = elem.position().top / scope.flowScale;

              for (var a = 0; a < scope.selectedNodeIds.length; a++) {
                var id = scope.selectedNodeIds[a];
                if (id == node.id)
                  continue;
                for (var i = 0; i < scope.object.nodes.length; i++) {
                  var n = scope.object.nodes[i];
                  if (n.id === id) {
                    n.posX += offset.x;
                    n.posY += offset.y;
                    var nelem = $("#node" + n.id);
                    nelem.css("top", n.posY + "px");
                    nelem.css("left", n.posX + "px");
                    jsPlumb.revalidate(nelem);
                  }
                }
              }
            },
            start: function (event, ui) {
              scope.movingActive = true;
              scope.selectionDisabled = true;
              scope.setLastActiveNodeId(node.id);
            },
            stop: function (event, ui) {
              scope.movingActive = false;
              if (scope.selectedNodeIds.indexOf(node.id) === -1) {
                var x = elem.position().left / scope.flowScale;
                var y = elem.position().top / scope.flowScale;
                $http.post(Paths.TEST_FLOW_NODE_SAVE.pf(node.id), {
                  "type": node.type,
                  "flowTest": scope.object.id,
                  "sourceTest": node.sourceTest,
                  "posX": x,
                  "posY": y,
                  "title": node.title
                }).success(function (data) {
                  if (data.result === 0) {
                    node.posX = x;
                    node.posY = y;
                  }
                });
              } else {
                $http.post(Paths.TEST_FLOW_NODE_MOVE, {
                  nodes: scope.serializeSelectedNodes()
                });
              }
            }
          });
        }
        $compile(elem)(scope);
      };

      scope.openNodeContextMenu = function ($event, id) {
        $timeout(function () {
          var elem = angular.element('#node' + id);
          elem.trigger({type: "contextmenu", pageX: $event.pageX, pageY: $event.pageY});
        });
      };

      scope.setLastActiveNodeId = function (id) {
        scope.lastActiveNodeId = id;
      };

      scope.getPortTooltip = function (portId) {
        var port = scope.collectionService.getPort(portId);
        var description = "";
        if (port.variableObject) {
          description = port.variableObject.description;
        }
        var tooltip = port.name;
        if (port.pointer == 1) {
          tooltip += port.type == 0 ? " <- " : " -> ";
          tooltip += "<b>" + port.pointerVariable + "</b>";
        }
        if (description && description != "")
          tooltip += "<div>" + description + "</div>";
        if (port.type == 0 && port.value) {
          tooltip += "<pre>" + port.value + "</pre>";
        }
        return tooltip;
      };

      scope.getConnectionTooltip = function (connectionId) {
        var connection = scope.collectionService.getConnection(connectionId);
        var sourcePort = scope.collectionService.getPort(connection.sourcePort);
        var destinationPort = scope.collectionService.getPort(connection.destinationPort);
        var tip = sourcePort.name + " -> " + destinationPort.name +
            "<pre>" + connection.returnFunction + "</pre>";
        return tip;
      };

      scope.serializeSelectedNodes = function () {
        var result = [];
        for (var i = 0; i < scope.selectedNodeIds.length; i++) {
          var id = scope.selectedNodeIds[i];
          for (var j = 0; j < scope.object.nodes.length; j++) {
            var node = scope.object.nodes[j];
            if (id != node.id)
              continue;
            result.push({
              id: node.id,
              posX: node.posX,
              posY: node.posY
            });
          }
        }
        return angular.toJson(result);
      };

      scope.toggleInputEval = function (port) {
        port.string = port.string === "1" ? "0" : "1"
        $http.post(Paths.TEST_FLOW_PORT_SAVE.pf(port.id), {
          "node": port.node,
          "variable": port.variable,
          "value": port.value,
          "string": port.string,
          "default": port.defaultValue
        }).success(function (data) {
        });
      };

      scope.excludeSelfFilter = function (value, index, array) {
        return value.name != scope.object.name;
      };

      scope.editNodeWizard = function (node, test) {
        var oldValue = angular.copy(node);
        var modalInstance = $uibModal.open({
          templateUrl: Paths.DIALOG_TEMPLATE_ROOT + "node_wizard_dialog.html",
          controller: NodeWizardController,
          scope: scope,
          resolve: {
            node: function () {
              return node;
            },
            test: function () {
              var copiedTest = angular.copy(test);
              copiedTest.starterContent = scope.object.starterContent;
              return copiedTest;
            }
          },
          size: "prc-lg"
        });

        modalInstance.result.then(function (response) {
          $http.post(Paths.TEST_FLOW_PORT_SAVE_COLLECTION, {
            "serializedCollection": angular.toJson(response.ports)
          });
        }, function () {
          scope.collectionService.updateNode(oldValue);
        });
      };

      scope.editNodeTitle = function (node) {
        var oldTitle = node.title;
        var modalInstance = $uibModal.open({
          templateUrl: Paths.DIALOG_TEMPLATE_ROOT + "textarea_dialog.html",
          controller: TextareaController,
          resolve: {
            readonly: function () {
              return false;
            },
            value: function () {
              return node.title;
            },
            title: function () {
              return Trans.TEST_FLOW_DIALOG_NODE_EDIT_TITLE_TITLE;
            },
            tooltip: function () {
              return Trans.TEST_FLOW_DIALOG_NODE_EDIT_TITLE_TOOLTIP;
            }
          },
          size: "lg"
        });

        modalInstance.result.then(function (response) {
          $http.post(Paths.TEST_FLOW_NODE_SAVE.pf(node.id), {
            "type": node.type,
            "flowTest": scope.object.id,
            "sourceTest": node.sourceTest,
            "posX": node.posX,
            "posY": node.posY,
            "title": response
          }).success(function (data) {
            node.title = data.object.title;
            scope.refreshNode(node);
          });
        }, function () {
          node.title = oldTitle;
        });
      };

      scope.editPortCode = function (port) {
        var oldPort = angular.copy(port);
        var editable = !scope.object.starterContent || scope.administrationSettingsService.starterContentEditable;
        var modalInstance = $uibModal.open({
          templateUrl: Paths.DIALOG_TEMPLATE_ROOT + "port_value_dialog.html",
          controller: PortValueEditController,
          scope: scope,
          resolve: {
            object: function () {
              return port;
            },
            editable: function () {
              return editable;
            }
          },
          size: port.type == 2 ? "prc-sm" : "prc-lg"
        });

        modalInstance.result.then(function (response) {
          switch (response.action) {
            case "save": {
              var object = response.object;
              $http.post(Paths.TEST_FLOW_PORT_SAVE.pf(object.id), {
                "node": object.node,
                "variable": object.variable,
                "value": object.value,
                "string": object.string,
                "default": object.defaultValue,
                "type": object.type,
                "dynamic": object.dynamic,
                "exposed": object.exposed,
                "name": object.name,
                "pointer": object.pointer,
                "pointerVariable": object.pointerVariable
              }).success(function (data) {
                if (data.result === 0) {
                  scope.collectionService.fetchNodesConnectionCollection(scope.object.id, function () {
                    scope.refreshNode(scope.collectionService.getNode(object.node));
                  });
                } else {
                  port.name = oldPort.name;
                  port.value = oldPort.value;
                  port.string = oldPort.string;
                  port.pointer = oldPort.pointer;
                  port.pointerVariable = oldPort.pointerVariable;
                }
              });
              break;
            }
            case "hide": {
              scope.hidePort(response.object.id);
              break;
            }
            case "removeConnections": {
              scope.removeAllConnections(response.object);
              break;
            }
          }
        }, function () {
          port.name = oldPort.name;
          port.value = oldPort.value;
          port.string = oldPort.string;
          port.pointer = oldPort.pointer;
          port.pointerVariable = oldPort.pointerVariable;
        });
      };

      scope.editConnectionCode = function (connection) {
        var oldValue = connection.returnFunction;
        var modalInstance = $uibModal.open({
          templateUrl: Paths.DIALOG_TEMPLATE_ROOT + "connection_return_function_dialog.html",
          controller: ConnectionReturnFunctionController,
          scope: scope,
          resolve: {
            object: function () {
              return connection;
            },
            title: function () {
              return connection.sourcePortObject.name + "->" + connection.destinationPortObject.name;
            },
            editable: function () {
              return !scope.object.starterContent || scope.administrationSettingsService.starterContentEditable;
            }
          },
          size: "lg"
        });

        modalInstance.result.then(function (response) {
          switch (response.action) {
            case "save": {
              var object = response.object;
              $http.post(Paths.TEST_FLOW_CONNECTION_SAVE.pf(connection.id), {
                "flowTest": object.flowTest,
                "sourceNode": object.sourceNode,
                "sourcePort": object.sourcePort,
                "destinationNode": object.destinationNode,
                "destinationPort": object.destinationPort,
                "returnFunction": object.returnFunction,
                "default": object.defaultReturnFunction,
                "type": object.type,
                "dynamic": object.dynamic,
                "exposed": object.exposed,
                "name": object.name
              }).success(function (data) {
                connection.returnFunction = data.object.returnFunction
              });
              break;
            }
            case "delete": {
              scope.removeConnection(connection.id);
              break;
            }
          }

        }, function () {
          connection.returnFunction = oldValue;
        });
      };

      scope.addNewNode = function (type, testId) {
        var posX = (scope.rightClickEvent.offsetX || (scope.rightClickEvent.pageX - $(scope.rightClickEvent.target).offset().left) / scope.flowScale);
        var posY = (scope.rightClickEvent.offsetY || (scope.rightClickEvent.pageY - $(scope.rightClickEvent.target).offset().top) / scope.flowScale);
        if (testId == null)
          testId = scope.object.id;
        $http.post(Paths.TEST_FLOW_NODE_ADD_COLLECTION.pf(scope.object.id), {
          "type": type,
          "flowTest": scope.object.id,
          "sourceTest": testId,
          "posX": posX,
          "posY": posY,
          "title": ""
        }).success(function (data) {
          if (data.result === 0) {
            scope.object.nodes.push(data.object);
            scope.drawNode(data.object);

            var sourceTest = angular.copy(TestCollectionService.get(data.object.sourceTest));

            if (sourceTest && sourceTest.sourceWizard) {
              scope.editNodeWizard(data.object, sourceTest);
            }
          }
        });
      };

      scope.copyNode = function (id) {
        if (scope.selectedNodeIds.length > 0) {
          scope.copySelectedNodes();
          return;
        }

        for (var i = 0; i < scope.object.nodes.length; i++) {
          var node = scope.object.nodes[i];
          if (node.id === id) {
            scope.copiedNodes = [
              node
            ];
            break;
          }
        }
      };

      scope.copySelectedNodes = function () {
        var nodes = [];
        for (var j = 0; j < scope.selectedNodeIds.length; j++) {
          var id = scope.selectedNodeIds[j];
          for (var i = 0; i < scope.object.nodes.length; i++) {
            var node = scope.object.nodes[i];
            if (node.id === id) {
              nodes.push(node);
              break;
            }
          }
        }
        scope.copiedNodes = nodes;
      };

      scope.pasteNodes = function (cursorPos) {
        if (scope.object.starterContent && !administrationSettingsService.starterContentEditable)
          return false;

        var posX = 0;
        var posY = 0;
        if (!cursorPos) {
          posX = (scope.rightClickEvent.offsetX || (scope.rightClickEvent.pageX - $(scope.rightClickEvent.target).offset().left) / scope.flowScale);
          posY = (scope.rightClickEvent.offsetY || (scope.rightClickEvent.pageY - $(scope.rightClickEvent.target).offset().top) / scope.flowScale);
        } else {
          posX = (scope.currentMouseEvent.offsetX || (scope.currentMouseEvent.pageX - $(scope.currentMouseEvent.target).offset().left) / scope.flowScale);
          posY = (scope.currentMouseEvent.offsetY || (scope.currentMouseEvent.pageY - $(scope.currentMouseEvent.target).offset().top) / scope.flowScale);
        }
        var offset = null;

        var nodes = angular.copy(scope.copiedNodes);

        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (offset === null) {
            offset = {
              posX: node.posX,
              posY: node.posY
            };
          } else {
            offset.posX = Math.min(offset.posX, node.posX);
            offset.posY = Math.min(offset.posY, node.posY);
          }
        }

        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          node.posX = posX + node.posX - offset.posX;
          node.posY = posY + node.posY - offset.posY;
        }

        var serializedNodes = angular.toJson(nodes);
        $http.post(Paths.TEST_FLOW_NODE_PASTE_COLLECTION.pf(scope.object.id), {
          nodes: serializedNodes
        }).success(function (data) {
          var nodeIds = [];
          for (var i = 0; i < data.collections.newNodes.length; i++) {
            var node = data.collections.newNodes[i];
            scope.object.nodes.push(node);
            nodeIds.push(node.id);
          }
          for (var i = 0; i < data.collections.newNodesConnections.length; i++) {
            var connection = data.collections.newNodesConnections[i];
            scope.object.nodesConnections.push(connection);
          }
          scope.refreshConnections(nodeIds);
        });
      };

      scope.removeNode = function (id) {
        if (scope.selectedNodeIds.length > 0) {
          scope.removeSelectedNodes();
          return;
        }

        scope.dialogsService.confirmDialog(
            Trans.TEST_FLOW_DIALOG_NODE_REMOVE_TITLE,
            Trans.TEST_FLOW_DIALOG_NODE_REMOVE_MESSAGE,
            function (response) {
              var node = null;
              for (var i = 0; i < scope.object.nodes.length; i++) {
                if (id === scope.object.nodes[i].id)
                  node = scope.object.nodes[i];
              }

              for (var i = 0; i < scope.object.nodesConnections.length; i++) {
                var connection = scope.object.nodesConnections[i];
                if (id === connection.sourceNode || id === connection.destinationNode) {
                  connection.removed = true;
                }
              }

              $http.post(Paths.TEST_FLOW_NODE_DELETE_COLLECTION.pf(id), {}).success(function (data) {
                if (data.result === 0) {
                  jsPlumb.remove("node" + id);
                  for (var i = scope.object.nodes.length - 1; i >= 0; i--) {
                    var node = scope.object.nodes[i];
                    if (node.id == id) {
                      scope.object.nodes.splice(i, 1);
                      break;
                    }
                  }
                  for (var i = scope.object.nodesConnections.length - 1; i >= 0; i--) {
                    var connection = scope.object.nodesConnections[i];
                    if (connection.sourceNode == id || connection.destinationNode == id) {
                      scope.object.nodesConnections.splice(i, 1);
                    }
                  }
                }
              });
            }
        );
      };

      scope.removeSelectedNodes = function () {
        scope.dialogsService.confirmDialog(
            Trans.TEST_FLOW_DIALOG_NODE_REMOVE_SELECTION_TITLE,
            Trans.TEST_FLOW_DIALOG_NODE_REMOVE_SELECTION_MESSAGE,
            function (response) {
              for (var a = 0; a < scope.selectedNodeIds.length; a++) {
                var id = scope.selectedNodeIds[a];
                var node = null;
                for (var i = 0; i < scope.object.nodes.length; i++) {
                  if (id === scope.object.nodes[i].id)
                    node = scope.object.nodes[i];
                }

                for (var i = 0; i < scope.object.nodesConnections.length; i++) {
                  var connection = scope.object.nodesConnections[i];
                  if (id === connection.sourceNode || id === connection.destinationNode) {
                    connection.removed = true;
                  }
                }
              }

              $http.post(Paths.TEST_FLOW_NODE_DELETE_COLLECTION.pf(scope.selectedNodeIds.join()), {}).success(function (data) {
                if (data.result === 0) {
                  for (var a = 0; a < scope.selectedNodeIds.length; a++) {
                    var id = scope.selectedNodeIds[a];
                    jsPlumb.remove("node" + id);

                    for (var i = scope.object.nodes.length - 1; i >= 0; i--) {
                      var node = scope.object.nodes[i];
                      if (node.id == id) {
                        scope.object.nodes.splice(i, 1);
                        break;
                      }
                    }
                    for (var i = scope.object.nodesConnections.length - 1; i >= 0; i--) {
                      var connection = scope.object.nodesConnections[i];
                      if (connection.sourceNode == id || connection.destinationNode == id) {
                        scope.object.nodesConnections.splice(i, 1);
                      }
                    }
                  }
                }
              });
            }
        );
      };

      scope.addConnection = function (concertoConnection, jspConnection) {
        var params = jspConnection.getParameters();
        $http.post(Paths.TEST_FLOW_CONNECTION_ADD_COLLECTION.pf(scope.object.id), {
          "flowTest": scope.object.id,
          "sourceNode": params.sourceNode.id,
          "sourcePort": params.sourcePort ? params.sourcePort.id : null,
          "destinationNode": params.targetNode.id,
          "destinationPort": params.targetPort ? params.targetPort.id : null,
          "default": "1"
        }).success(function (data) {
          if (data.result === 0) {
            for (var i = 0; i < data.collections.newNodesConnections.length; i++) {
              var newConnection = data.collections.newNodesConnections[i];
              var found = false;
              for (var j = 0; j < scope.object.nodesConnections.length; j++) {
                var connection = scope.object.nodesConnections[j];
                if (connection.id == newConnection.id) {
                  found = true;
                  break;
                }
              }
              if (!found) {
                scope.object.nodesConnections.push(newConnection);
              }
            }
            scope.refreshConnections([params.sourceNode.id, params.targetNode.id]);
          }
        });
      };

      scope.saveConnection = function (concertoConnection, jspConnection) {
        var id = 0;
        if (concertoConnection)
          id = concertoConnection.id;

        var params = jspConnection.getParameters();
        $http.post(Paths.TEST_FLOW_CONNECTION_SAVE.pf(id), {
          "flowTest": scope.object.id,
          "sourceNode": params.sourceNode.id,
          "sourcePort": params.sourcePort ? params.sourcePort.id : null,
          "destinationNode": params.targetNode.id,
          "destinationPort": params.targetPort ? params.targetPort.id : null,
          "default": "1"
        }).success(function (data) {
          if (data.result === 0) {
            jspConnection.setParameter("concertoConnection", data.object);
            for (var j = 0; j < scope.object.nodesConnections.length; j++) {
              var connection = scope.object.nodesConnections[j];
              if (connection.id == data.object.id) {
                scope.object.nodesConnections[j] = data.object;

                for (var k = 0; k < scope.object.nodes.length; k++) {
                  var node = scope.object.nodes[k];
                  if (node.id == connection.destinationNode) {
                    scope.refreshNode(node);
                    break;
                  }
                }
                break;
              }
            }
          }
        });
      };

      scope.connect = function (concertoConnection) {
        jsPlumb.connect({
          uuids: [
            "node" + concertoConnection.sourceNode + "-ep" + (concertoConnection.sourcePort ? concertoConnection.sourcePort : "_out"),
            "node" + concertoConnection.destinationNode + "-ep" + (concertoConnection.destinationPort ? concertoConnection.destinationPort : "_entry"),
          ],
          parameters: {
            concertoConnection: concertoConnection
          },
          paintStyle: {
            dashstyle: "dot",
            strokeStyle: scope.getConnectionStrokeStyle(concertoConnection.automatic, concertoConnection.sourcePortObject ? concertoConnection.sourcePortObject.type : 2),
            lineWidth: scope.getConnectionLineWidth(concertoConnection.sourcePortObject ? concertoConnection.sourcePortObject.type : 2)
          }
        });
      };

      scope.getConnectionStrokeStyle = function (automatic, type) {
        switch (parseInt(type)) {
            //in - out
          case 2:
            return "#858C8F";
            //params
          case 1:
          default:
            return "#CCD5D9";
        }
      };

      scope.getConnectionLineWidth = function (type) {
        switch (parseInt(type)) {
            //in - out
          case 2:
            return 3;
            //params
          case 1:
          default:
            return 1;
        }
      };

      scope.setUpConnection = function (jspConnection) {
        var params = jspConnection.getParameters();
        if (params.sourcePort && params.sourcePort.type == 1) {
          if (jspConnection.getOverlay("overlayConnection" + params.concertoConnection.id))
            return;
          jspConnection.addOverlay(
              ["Custom", {
                create: function (component) {
                  var overlayElem = $("<div>" +
                      "<div id='divConnectionControl" + params.concertoConnection.id + "'>" +
                      "<i class='clickable glyphicon glyphicon-align-justify' ng-class='{\"return-function-default\": collectionService.getConnection(" + params.concertoConnection.id + ").defaultReturnFunction == \"1\"}' " +
                      "ng-click='editConnectionCode(collectionService.getConnection(" + params.concertoConnection.id + "))' " +
                      "uib-tooltip-html='getConnectionTooltip(" + params.concertoConnection.id + ")' tooltip-append-to-body='true'></i></div>" +
                      "</div>");
                  $compile(overlayElem)(scope);
                  return overlayElem;
                },
                location: 0.5,
                id: "overlayConnection" + params.concertoConnection.id
              }]);
        } else if (!params.sourcePort || params.sourcePort.type == 2) {
          jspConnection.addOverlay(
              ["Arrow", {location: 0.5, paintStyle: {fillStyle: "orange", strokeStyle: "grey"}}]);
        }
      };

      scope.removeAllConnections = function (port) {
        DialogsService.confirmDialog(
            Trans.TEST_FLOW_PORT_DIALOG_TITLE_REMOVE_ALL_CONNECTIONS,
            Trans.TEST_FLOW_PORT_DIALOG_CONTENT_REMOVE_ALL_CONNECTIONS.pf(port.id),
            function (data) {
              var connectionIds = [];
              for (var i = 0; i < scope.object.nodesConnections.length; i++) {
                var connection = scope.object.nodesConnections[i];
                if (connection.sourcePort == port.id || connection.destinationPort == port.id) {
                  connectionIds.push(connection.id);
                }
              }
              scope.removeConnection(connectionIds.join(","));
            }
        );
      };

      scope.removeConnection = function (ids) {
        var idsArray = String(ids).split(",");
        for (var i = 0; i < scope.object.nodesConnections.length; i++) {
          var connection = scope.object.nodesConnections[i];
          var index = idsArray.indexOf(connection.id);
          if (index !== -1 && connection.removed) {
            idsArray.splice(index, 1);
          }
        }

        $http.post(Paths.TEST_FLOW_CONNECTION_DELETE_COLLECTION.pf(idsArray.join(",")), {}).success(function (data) {
          if (data.result === 0) {
            for (var i = 0; i < idsArray.length; i++) {
              $("#overlayConnection" + idsArray[i]).remove();
            }

            for (var i = scope.object.nodesConnections.length - 1; i >= 0; i--) {
              var connection = scope.object.nodesConnections[i];
              if (idsArray.indexOf(String(connection.id)) != -1) {
                scope.object.nodesConnections.splice(i, 1);

                if (!connection.sourcePort || connection.sourcePort.type == 2) {
                  for (var j = scope.object.nodesConnections.length - 1; j >= 0; j--) {
                    var otherConn = scope.object.nodesConnections[j];
                    if (otherConn.sourceNode == connection.sourceNode && otherConn.targetNode == connection.targetNode && otherConn.automatic == 1) {
                      scope.object.nodesConnections.splice(j, 1);
                    }
                  }
                }
                scope.refreshConnections([connection.sourceNode, connection.destinationNode], false);
              }
            }
          }
        });
      };

      scope.isPortVisible = function (node, port) {
        if (node.type != 0 || port.exposed == 1) {
          return true;
        }
        return false;
      };

      scope.canRemovePort = function (node, port) {
        if (node.type == 0 && !scope.isPortConnected(port) && port.pointer != 1) return true;
        else return false;
      };

      scope.isPortConnected = function (port) {
        for (var i = 0; i < scope.object.nodesConnections.length; i++) {
          var conn = scope.object.nodesConnections[i];
          if (conn.sourcePort == port.id || conn.destinationPort == port.id)
            return true;
        }
        return false;
      };

      scope.usesDefaultValue = function (port) {
        if (port === null) return true;
        return port.defaultValue == 1 && port.pointer == 0;
      };

      jsPlumb.setContainer($("#flowContainer"));

      scope.refreshFlow = function () {
        scope.refreshing = true;
        scope.clearNodeSelection();
        jsPlumb.unbind('beforeDrop');
        jsPlumb.unbind('connection');
        jsPlumb.unbind('connectionMoved');
        jsPlumb.unbind('connectionDetached');
        jsPlumb.deleteEveryEndpoint();

        $("#flowContainer .node").remove();

        jsPlumb.bind("beforeDrop", function (info) {
          if (!scope.jsPlumbEventsEnabled)
            return;
          if (!info.dropEndpoint || info.connection.endpoints.length === 0)
            return false;

          var sourceParams = info.connection.endpoints[0].getParameters();
          var targetParams = info.dropEndpoint.getParameters();

          var sourcePortType = null;
          if (!sourceParams.sourcePort) {
            sourcePortType = 2;
          } else {
            sourcePortType = sourceParams.sourcePort.type;
          }

          var targetPortType = null;
          if (targetParams.targetPort) {
            if (targetParams.targetPort.pointer == 1) {
              return false;
            }
            targetPortType = targetParams.targetPort.type;
          }

          switch (parseInt(sourcePortType)) {
              //return
            case 1:
              if (targetPortType !== 0)
                return false;
              break;
              //branch
            case 2:
              if (targetPortType !== null)
                return false;
              break;
          }

          for (var i = 0; i < scope.object.nodesConnections.length; i++) {
            var connection = scope.object.nodesConnections[i];
            if (connection.sourcePort == sourceParams.sourcePort.id && connection.destinationPort == targetParams.targetPort.id) return false;
          }

          return true;
        });

        jsPlumb.bind("connection", function (info) {
          if (!scope.jsPlumbEventsEnabled)
            return;
          var params = info.connection.getParameters();
          if (!params.concertoConnection) {
            scope.addConnection(params.concertoConnection, info.connection);
            return;
          }
          scope.setUpConnection(info.connection);
        });

        jsPlumb.bind("connectionMoved", function (info) {
          if (!scope.jsPlumbEventsEnabled)
            return;
          var params = info.connection.getParameters();
          scope.saveConnection(params.concertoConnection, info.connection);
        });

        jsPlumb.bind("connectionDetached", function (info) {
          if (!scope.jsPlumbEventsEnabled)
            return;
          var params = info.connection.getParameters();
          if (!params.concertoConnection)
            return;
          scope.removeConnection(params.concertoConnection.id);
        });

        $timeout(function () {
          if (!scope.object.nodes)
            return;
          jsPlumb.setSuspendDrawing(true);
          for (var i = 0; i < scope.object.nodes.length; i++) {
            scope.drawNode(scope.object.nodes[i]);
          }
          for (var i = 0; i < scope.object.nodesConnections.length; i++) {
            scope.connect(scope.object.nodesConnections[i]);
          }
          jsPlumb.setSuspendDrawing(false, true);
          if (!scope.initialized) {
            scope.initialized = true;
            scope.resetView();
          }
          scope.refreshing = false;
          jsPlumb.setZoom(scope.flowScale);
        }, 1);
      };

      scope.lastScrollTop = 0;
      scope.lastScrollLeft = 0;
      $(function () {
        $("#flowContainerScroll").flow();

        /** IE fix start */
        $('#flowContainerScroll').scroll(function () {
          scope.lastScrollTop = $("#flowContainerScroll").scrollTop();
          scope.lastScrollLeft = $("#flowContainerScroll").scrollLeft();
        });

        $('#flowContainer').focus(function () {
          $('#flowContainerScroll').scrollLeft(scope.lastScrollLeft);
          $('#flowContainerScroll').scrollTop(scope.lastScrollTop);
        });
        /** IE fix end */

        $('#flowContainer').mousewheel(function (event) {
          scope.setZoom(event.deltaY);
          return false;
        }).mousemove(function (event) {
          scope.currentMouseEvent = event;
        });
      });

      scope.$watchCollection("object.variables", function () {
        scope.initialized = false;
        if (scope.object.nodes.length > 0) {
          scope.refreshFlow();
        }
      });

      scope.$on('$locationChangeStart', function (event, toUrl, fromUrl) {
        if (scope.maximized)
          scope.toggleMaximize();
      });
    }
  };
}]);